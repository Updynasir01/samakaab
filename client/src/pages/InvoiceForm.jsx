import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { customersApi, invoicesApi } from "../api.js";
import { formatMoney, todayISO, BALANCE_EPS, invoiceLaterPayments, toInputDate } from "../util.js";
import { parseInvoiceFile } from "../parseInvoiceSpreadsheet.js";

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function emptyLine() {
  return { id: crypto.randomUUID(), description: "", quantity: "1", unit: "", unitPrice: "" };
}

/** Keep typing smooth; normalize to 2 decimals only on blur. */
function normalizeMoneyInput(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const n = parseFloat(s.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return s;
  return String(round2(n));
}

export default function InvoiceForm() {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const isEdit = Boolean(editId);
  const [searchParams] = useSearchParams();
  const preCustomer = searchParams.get("customer") || "";

  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState(preCustomer);
  const [receiptTakerName, setReceiptTakerName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [date, setDate] = useState(todayISO());
  const [expectedPayDate, setExpectedPayDate] = useState(todayISO());
  const [paidAtSale, setPaidAtSale] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState([emptyLine()]);
  const [paymentsApplied, setPaymentsApplied] = useState(0);
  const [err, setErr] = useState("");
  const [uploadHint, setUploadHint] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    customersApi.list().then(setCustomers).catch(() => {});
    if (!isEdit) {
      invoicesApi
        .nextNumber()
        .then((d) => setInvoiceNumber(String(d?.invoiceNumber ?? "")))
        .catch(() => {});
      return;
    }
    setLoading(true);
    invoicesApi
      .get(editId)
      .then((inv) => {
        setCustomerId(inv.customer?._id || inv.customer || "");
        setReceiptTakerName(inv.receiptTakerName || "");
        setInvoiceNumber(String(inv.invoiceNumber ?? ""));
        setOrderNumber(inv.orderNumber || "");
        setDate(toInputDate(inv.date));
        setExpectedPayDate(inv.expectedPayDate ? toInputDate(inv.expectedPayDate) : toInputDate(inv.date));
        setPaidAtSale(Number(inv.paidAtSale || 0) > 0 ? String(inv.paidAtSale) : "");
        setNote(inv.note || "");
        setPaymentsApplied(invoiceLaterPayments(inv));
        setItems(
          (inv.lineItems || []).length
            ? inv.lineItems.map((li) => ({
                id: crypto.randomUUID(),
                mongoId: li._id,
                description: li.description || "",
                quantity: String(li.quantity ?? ""),
                unit: li.unit || "",
                unitPrice: String(li.unitPrice ?? ""),
              }))
            : [emptyLine()]
        );
      })
      .catch((e) => setErr(e.message || "Could not load invoice"))
      .finally(() => setLoading(false));
  }, [editId, isEdit]);

  const lineTotals = items.map((row) => {
    const q = round2(row.quantity || 0);
    const p = round2(row.unitPrice || 0);
    return round2(q * p);
  });
  const total = round2(lineTotals.reduce((s, t) => s + t, 0));
  const paidNum = paidAtSale === "" ? 0 : round2(paidAtSale);
  const creditPreview = round2(total - paidNum);
  const minTotal = round2(paidNum + paymentsApplied);

  function addRow() {
    setItems([...items, emptyLine()]);
  }

  function updateRow(i, field, value) {
    const next = [...items];
    next[i] = { ...next[i], [field]: value };
    setItems(next);
  }

  function removeRow(i) {
    if (items.length <= 1) return;
    setItems(items.filter((_, j) => j !== i));
  }

  async function onUploadSpreadsheet(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr("");
    setUploadHint("");
    try {
      const { lines, warnings, skippedRows } = await parseInvoiceFile(file);
      setItems(
        lines.map((l) => ({
          id: crypto.randomUUID(),
          description: l.description,
          quantity: String(l.quantity),
          unit: l.unit || "",
          unitPrice: String(l.unitPrice),
        }))
      );
      const parts = [];
      if (warnings.length) parts.push(warnings.slice(0, 5).join(" "));
      if (warnings.length > 5) parts.push(`…and ${warnings.length - 5} more warnings.`);
      if (skippedRows) parts.push(`${skippedRows} row(s) skipped.`);
      setUploadHint(parts.join(" ") || `Loaded ${lines.length} line(s).`);
      if (isEdit) {
        setUploadHint((h) => `${h} Delivery checkmarks on replaced lines will reset unless you keep original rows.`.trim());
      }
    } catch (x) {
      setErr(x.message || "Could not read file");
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (total <= 0) {
      setErr("Add at least one line with a positive total.");
      return;
    }
    if (isEdit && total + BALANCE_EPS < minTotal) {
      setErr(`Total cannot be below ${formatMoney(minTotal)} — that amount is already paid on this invoice.`);
      return;
    }
    if (creditPreview > BALANCE_EPS && !customerId) {
      setErr("Choose a customer (create one under Customers first) when there is an unpaid balance.");
      return;
    }
    if (creditPreview > BALANCE_EPS && !expectedPayDate) {
      setErr("Set the expected pay date for the unpaid amount.");
      return;
    }

    setSaving(true);
    try {
      const lineItems = items.map((row) => {
        const line = {
          description: row.description.trim(),
          quantity: round2(row.quantity),
          unit: String(row.unit || "").trim(),
          unitPrice: round2(row.unitPrice),
        };
        if (row.mongoId) line._id = row.mongoId;
        return line;
      });
      if (lineItems.some((l) => !l.description || l.quantity < 0 || l.unitPrice < 0)) {
        setErr("Each line needs a description and valid quantity / unit price.");
        setSaving(false);
        return;
      }

      const body = {
        lineItems,
        date: new Date(date).toISOString(),
        paidAtSale: paidNum,
        note: note.trim(),
        orderNumber: orderNumber.trim(),
        ...(customerId
          ? { customer: customerId, receiptTakerName: "" }
          : { customer: "", receiptTakerName: receiptTakerName.trim() }),
        ...(creditPreview > BALANCE_EPS ? { expectedPayDate: new Date(expectedPayDate).toISOString() } : {}),
        ...(!isEdit && invoiceNumber && Number(invoiceNumber) > 0 ? { invoiceNumber: Number(invoiceNumber) } : {}),
      };

      const inv = isEdit ? await invoicesApi.update(editId, body) : await invoicesApi.create(body);
      navigate(`/invoices/${inv._id}`, { replace: true });
    } catch (x) {
      setErr(x.message || "Could not save invoice");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p style={{ color: "var(--muted)" }}>Loading invoice…</p>;
  }

  return (
    <div>
      <p style={{ marginTop: 0 }}>
        <Link to={isEdit ? `/invoices/${editId}` : "/invoices"}>← {isEdit ? "Invoice" : "Invoices"}</Link>
      </p>
      <h1 style={{ marginTop: 0 }}>{isEdit ? `Edit invoice #${invoiceNumber}` : "New invoice"}</h1>
      <p style={{ color: "var(--muted)", maxWidth: 640 }}>
        Enter each product or service as a line. Set <strong>Paid now</strong> to what the customer pays today (cash or partial). The
        rest goes on credit for the selected customer.
      </p>
      {isEdit && paymentsApplied > BALANCE_EPS && (
        <p style={{ color: "var(--muted)", maxWidth: 640, fontSize: "0.9rem" }}>
          Later payments of <strong>{formatMoney(paymentsApplied)}</strong> are already applied — invoice total cannot go below{" "}
          <strong>{formatMoney(minTotal)}</strong>.
        </p>
      )}

      <form onSubmit={onSubmit} className="card" style={{ marginTop: "1rem" }}>
        {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

        <div className="grid grid-2" style={{ marginBottom: "1rem" }}>
          <div>
            <label>Customer (required if there is credit)</label>
            <select
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                if (e.target.value) setReceiptTakerName("");
              }}
            >
              <option value="">— Walk-in (only if fully paid at sale) —</option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.fullName} — {c.phone}
                </option>
              ))}
            </select>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0.35rem 0 0" }}>
              New customer? <Link to="/customers/new">Create profile</Link> first, then return here.
            </p>
          </div>
          <div>
            <label>Invoice date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>

        {!customerId && (
          <div style={{ marginBottom: "1rem" }}>
            <label htmlFor="receipt-taker">Receipt taker name (walk-in)</label>
            <input
              id="receipt-taker"
              value={receiptTakerName}
              onChange={(e) => setReceiptTakerName(e.target.value)}
              placeholder="Name printed on the cash receipt (optional)"
              autoComplete="name"
            />
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0.35rem 0 0" }}>
              Shown under TO on the cash receipt. Leave blank to print “Walk-in”.
            </p>
          </div>
        )}

        <div className="grid grid-2" style={{ marginBottom: "1rem" }}>
          <div>
            <label>Invoice number</label>
            <input
              type="number"
              min="1"
              step="1"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="Auto"
              readOnly={isEdit}
              style={isEdit ? { background: "var(--bg-soft)" } : undefined}
            />
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0.35rem 0 0" }}>
              {isEdit ? "Invoice number cannot be changed." : "Automatically suggested, but you can edit if needed."}
            </p>
          </div>
          <div>
            <label>Order number</label>
            <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="Optional" />
          </div>
        </div>

        <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.5rem" }}>Line items</h2>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.35rem" }}>
          <label className="btn" style={{ margin: 0, cursor: "pointer" }}>
            Upload spreadsheet
            {/* No accept= filter — Windows/OneDrive often hides files in Documents when accept is set */}
            <input type="file" style={{ display: "none" }} onChange={onUploadSpreadsheet} />
          </label>
        </div>
        <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0 0 0.75rem" }}>
          Excel (.xlsx, .xls) or CSV. In the file picker, choose <strong>All files</strong> if your spreadsheet does not appear
          (common in Documents / OneDrive folders).
        </p>
        {uploadHint && (
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 0.75rem" }}>
            {uploadHint}
          </p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ width: 88 }}>Qty</th>
                <th style={{ width: 88 }}>Unit</th>
                <th style={{ width: 110 }}>Unit price</th>
                <th style={{ width: 100 }}>Line total</th>
                <th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => (
                <tr key={row.id}>
                  <td>
                    <input
                      value={row.description}
                      onChange={(e) => updateRow(i, "description", e.target.value)}
                      placeholder="e.g. Rice 25kg"
                      autoComplete="off"
                      required
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.quantity}
                      onChange={(e) => updateRow(i, "quantity", e.target.value)}
                      onBlur={(e) => updateRow(i, "quantity", normalizeMoneyInput(e.target.value))}
                      autoComplete="off"
                    />
                  </td>
                  <td>
                    <input
                      value={row.unit || ""}
                      onChange={(e) => updateRow(i, "unit", e.target.value)}
                      placeholder="BOX"
                      autoComplete="off"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.unitPrice}
                      onChange={(e) => updateRow(i, "unitPrice", e.target.value)}
                      onBlur={(e) => updateRow(i, "unitPrice", normalizeMoneyInput(e.target.value))}
                      autoComplete="off"
                    />
                  </td>
                  <td>{formatMoney(lineTotals[i])}</td>
                  <td>
                    <button type="button" className="btn btn-ghost" onClick={() => removeRow(i)} disabled={items.length <= 1}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn" style={{ marginTop: "0.5rem" }} onClick={addRow}>
          + Add line
        </button>

        <div className="grid grid-2" style={{ marginTop: "1.25rem" }}>
          <div>
            <label>Invoice total</label>
            <div
              style={{
                padding: "0.55rem 0.8rem",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--bg-soft)",
                fontWeight: 600,
              }}
            >
              {formatMoney(total)}
            </div>
          </div>
          <div>
            <label>Paid now (at sale)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={paidAtSale}
              onChange={(e) => setPaidAtSale(e.target.value)}
              placeholder={String(total)}
            />
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0.35rem 0 0" }}>
              Leave empty or 0 for full credit (customer required). Set equal to total for full cash payment.
            </p>
          </div>
        </div>

        {creditPreview > BALANCE_EPS && (
          <div style={{ marginTop: "1rem" }}>
            <label>Expected pay date (unpaid {formatMoney(creditPreview)})</label>
            <input type="date" value={expectedPayDate} onChange={(e) => setExpectedPayDate(e.target.value)} required />
          </div>
        )}

        <div style={{ marginTop: "1rem" }}>
          <label>Note (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Delivery, discount note…" />
        </div>

        <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Save invoice"}
          </button>
          <Link to={isEdit ? `/invoices/${editId}` : "/invoices"} className="btn btn-ghost">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
