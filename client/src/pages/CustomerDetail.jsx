import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { customersApi, creditsApi, paymentsApi, invoicesApi } from "../api.js";
import { useAuth } from "../auth.jsx";
import { formatMoney, toInputDate, todayISO } from "../util.js";
import {
  buildAccountReportHtml,
  downloadAccountReportPdf,
  downloadAccountReportWord,
  printAccountReportFromHtml,
} from "../accountReportExport.js";

const EPS = 0.005;

function sumPaymentsLinkedToInvoice(payments, invoiceId) {
  return payments
    .filter((p) => p.invoice && String(p.invoice) === String(invoiceId))
    .reduce((s, p) => s + Number(p.amount || 0), 0);
}

/** Any invoice with cash collected at sale (full or partial) — for display list. */
function invoicesWithPaidAtSale(invoices) {
  return (invoices || []).filter((inv) => Number(inv.paidAtSale || 0) > EPS);
}

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const isNew = id === "new";

  const [customer, setCustomer] = useState(null);
  const [credits, setCredits] = useState([]);
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ fullName: "", phone: "", address: "", notes: "" });

  const [creditForm, setCreditForm] = useState({
    amount: "",
    description: "",
    dateOfCredit: todayISO(),
    expectedPayDate: todayISO(),
  });
  const [payForm, setPayForm] = useState({ amount: "", paidAt: todayISO(), note: "", invoiceId: "" });

  useEffect(() => {
    if (isNew) return;
    setErr("");
    Promise.all([
      customersApi.get(id),
      creditsApi.byCustomer(id),
      paymentsApi.byCustomer(id),
      invoicesApi.byCustomer(id),
    ])
      .then(([c, cr, py, inv]) => {
        setCustomer(c);
        setForm({
          fullName: c.fullName,
          phone: c.phone,
          address: c.address || "",
          notes: c.notes || "",
        });
        setCredits(cr);
        setPayments(py);
        setInvoices(inv);
      })
      .catch((e) => setErr(e.message));
  }, [id, isNew]);

  async function saveProfile(e) {
    e.preventDefault();
    setErr("");
    try {
      if (isNew) {
        const c = await customersApi.create(form);
        navigate(`/customers/${c._id}`, { replace: true });
      } else {
        const c = await customersApi.update(id, form);
        setCustomer((prev) => ({ ...prev, ...c }));
      }
    } catch (e) {
      setErr(e.message);
    }
  }

  async function addCredit(e) {
    e.preventDefault();
    setErr("");
    try {
      await creditsApi.create({
        customer: id,
        amount: Number(creditForm.amount),
        description: creditForm.description,
        dateOfCredit: creditForm.dateOfCredit,
        expectedPayDate: creditForm.expectedPayDate,
      });
      const [c, cr, py, inv] = await Promise.all([
        customersApi.get(id),
        creditsApi.byCustomer(id),
        paymentsApi.byCustomer(id),
        invoicesApi.byCustomer(id),
      ]);
      setCustomer(c);
      setCredits(cr);
      setPayments(py);
      setInvoices(inv);
      setCreditForm({ amount: "", description: "", dateOfCredit: todayISO(), expectedPayDate: todayISO() });
    } catch (e) {
      setErr(e.message);
    }
  }

  async function addPayment(e) {
    e.preventDefault();
    setErr("");
    try {
      await paymentsApi.create({
        customer: id,
        amount: Number(payForm.amount),
        paidAt: payForm.paidAt,
        note: payForm.note,
        ...(payForm.invoiceId ? { invoice: payForm.invoiceId } : {}),
      });
      const [c, cr, py, inv] = await Promise.all([
        customersApi.get(id),
        creditsApi.byCustomer(id),
        paymentsApi.byCustomer(id),
        invoicesApi.byCustomer(id),
      ]);
      setCustomer(c);
      setCredits(cr);
      setPayments(py);
      setInvoices(inv);
      setPayForm({ amount: "", paidAt: todayISO(), note: "", invoiceId: "" });
    } catch (e) {
      setErr(e.message);
    }
  }

  async function delCustomer() {
    if (!isAdmin || !window.confirm("Delete this customer and all invoices, credit, and payment records?")) return;
    try {
      await customersApi.remove(id);
      navigate("/customers");
    } catch (e) {
      setErr(e.message);
    }
  }

  async function delCredit(cid) {
    if (!isAdmin || !window.confirm("Delete this credit entry?")) return;
    try {
      await creditsApi.remove(cid);
      const [c, cr, py, inv] = await Promise.all([
        customersApi.get(id),
        creditsApi.byCustomer(id),
        paymentsApi.byCustomer(id),
        invoicesApi.byCustomer(id),
      ]);
      setCustomer(c);
      setCredits(cr);
      setPayments(py);
      setInvoices(inv);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function delPayment(pid) {
    if (!isAdmin || !window.confirm("Delete this payment?")) return;
    try {
      await paymentsApi.remove(pid);
      const [c, cr, py, inv] = await Promise.all([
        customersApi.get(id),
        creditsApi.byCustomer(id),
        paymentsApi.byCustomer(id),
        invoicesApi.byCustomer(id),
      ]);
      setCustomer(c);
      setCredits(cr);
      setPayments(py);
      setInvoices(inv);
    } catch (e) {
      setErr(e.message);
    }
  }

  if (!isNew && !customer && !err) {
    return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  }

  const totalCreditAmt = credits.reduce((s, cr) => s + (Number(cr.amount) || 0), 0);

  const paymentRowsMerged = [
    ...payments.map((p) => ({
      kind: "entry",
      key: `pay-${p._id}`,
      sortTime: new Date(p.paidAt).getTime(),
      entry: p,
    })),
    ...invoicesWithPaidAtSale(invoices).map((inv) => ({
      kind: "atSale",
      key: `at-sale-${inv._id}`,
      sortTime: new Date(inv.date).getTime(),
      invoice: inv,
    })),
  ].sort((a, b) => b.sortTime - a.sortTime);

  const totalPaymentAmt = paymentRowsMerged.reduce((s, row) => {
    if (row.kind === "entry") return s + (Number(row.entry.amount) || 0);
    return s + (Number(row.invoice.paidAtSale) || 0);
  }, 0);

  /** One chronological report: Credit + Payment recorded + At sale pay (all Dis types). */
  const accountReportRows = [
    ...credits.map((cr) => {
      const inv = cr.invoice ? invoices.find((i) => String(i._id) === String(cr.invoice)) : null;
      return {
        key: `r-cr-${cr._id}`,
        sortTime: new Date(cr.dateOfCredit).getTime(),
        date: toInputDate(cr.dateOfCredit),
        dis: "Credit",
        due: toInputDate(cr.expectedPayDate),
        detail: String(cr.description || "").trim() || "—",
        invoiceNum: inv ? inv.invoiceNumber : null,
        invoiceId: cr.invoice,
        amount: Number(cr.amount) || 0,
      };
    }),
    ...paymentRowsMerged.map((row) => {
      if (row.kind === "entry") {
        const inv = row.entry.invoice
          ? invoices.find((i) => String(i._id) === String(row.entry.invoice))
          : null;
        return {
          key: `r-${row.key}`,
          sortTime: row.sortTime,
          date: toInputDate(row.entry.paidAt),
          dis: "Payment recorded",
          due: "—",
          detail: String(row.entry.note || "").trim() || "—",
          invoiceNum: inv ? inv.invoiceNumber : null,
          invoiceId: row.entry.invoice,
          amount: Number(row.entry.amount) || 0,
        };
      }
      return {
        key: `r-${row.key}`,
        sortTime: row.sortTime,
        date: toInputDate(row.invoice.date),
        dis: "At sale pay",
        due: "—",
        detail: "Cash at sale (invoice)",
        invoiceNum: row.invoice.invoiceNumber,
        invoiceId: row.invoice._id,
        amount: Number(row.invoice.paidAtSale) || 0,
      };
    }),
  ].sort((a, b) => b.sortTime - a.sortTime);

  const reportTotals = {
    totalCredit: totalCreditAmt,
    totalPayments: totalPaymentAmt,
    balance: Number(customer?.balance ?? 0),
  };

  function handlePrintReport() {
    if (!customer) return;
    printAccountReportFromHtml(buildAccountReportHtml(customer, accountReportRows, reportTotals));
  }

  function handleDownloadPdf() {
    if (!customer) return;
    downloadAccountReportPdf(customer, accountReportRows, reportTotals);
  }

  function handleDownloadWord() {
    if (!customer) return;
    downloadAccountReportWord(customer, accountReportRows, reportTotals);
  }

  return (
    <div>
      <p style={{ marginTop: 0 }}>
        <Link to="/customers">← Customers</Link>
      </p>
      <h1 style={{ marginTop: 0 }}>{isNew ? "New customer" : customer?.fullName}</h1>
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Profile</h2>
        <form onSubmit={saveProfile}>
          <div className="grid grid-2">
            <div>
              <label>Full name</label>
              <input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
              />
            </div>
            <div>
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            </div>
            <div>
              <label>Address (optional)</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <label>Notes</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="submit" className="btn btn-primary">
              {isNew ? "Create customer" : "Save profile"}
            </button>
            {!isNew && isAdmin && (
              <button type="button" className="btn btn-danger" onClick={delCustomer}>
                Delete customer
              </button>
            )}
          </div>
        </form>
      </div>

      {!isNew && customer && (
        <>
          <div className="card" style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Invoices</h2>
              <Link to={`/invoices/new?customer=${id}`} className="btn btn-primary">
                New sale (invoice)
              </Link>
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0.5rem 0" }}>
              Register items bought on an invoice. Unpaid amounts appear on this account for payment tracking.
              <strong> Remaining</strong> is on-credit for that invoice minus payments linked to it (see Record payment).
              Unlinked payments still reduce the account balance below.
            </p>
            {invoices.length === 0 ? (
              <p style={{ color: "var(--muted)", margin: 0 }}>No invoices yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Date</th>
                      <th>Total</th>
                      <th>Paid at sale</th>
                      <th>On credit</th>
                      <th>Paid (linked)</th>
                      <th>Remaining</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => {
                      const linked = sumPaymentsLinkedToInvoice(payments, inv._id);
                      const credit = Number(inv.creditAmount || 0);
                      const remaining = Math.max(0, credit - linked);
                      const showRemain = inv.paymentStatus !== "paid" || credit > 0 || linked > 0;
                      const pas = Number(inv.paidAtSale || 0);
                      return (
                        <tr key={inv._id}>
                          <td>
                            <Link to={`/invoices/${inv._id}`}>#{inv.invoiceNumber}</Link>
                          </td>
                          <td>{new Date(inv.date).toLocaleDateString()}</td>
                          <td>{formatMoney(inv.total)}</td>
                          <td>{pas > EPS ? formatMoney(pas) : "—"}</td>
                          <td>{credit > 0 ? formatMoney(credit) : "—"}</td>
                          <td>{linked > 0 ? formatMoney(linked) : "—"}</td>
                          <td>{showRemain ? formatMoney(remaining) : "—"}</td>
                          <td>{inv.paymentStatus}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: "1rem" }}>
            <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Balance</h2>
            <p style={{ fontSize: "1.25rem", margin: 0 }}>
              <strong>{formatMoney(customer.balance)}</strong>{" "}
              <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                (credit {formatMoney(customer.totalCredit)} − paid {formatMoney(customer.totalPayments)})
              </span>
            </p>
          </div>

          <div className="grid grid-2" style={{ marginBottom: "1rem" }}>
            <div className="card">
              <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Add credit</h2>
              <form onSubmit={addCredit}>
                <div style={{ marginBottom: "0.5rem" }}>
                  <label>Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={creditForm.amount}
                    onChange={(e) => setCreditForm({ ...creditForm, amount: e.target.value })}
                    required
                  />
                </div>
                <div style={{ marginBottom: "0.5rem" }}>
                  <label>Description</label>
                  <input
                    value={creditForm.description}
                    onChange={(e) => setCreditForm({ ...creditForm, description: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-2">
                  <div>
                    <label>Credit date</label>
                    <input
                      type="date"
                      value={creditForm.dateOfCredit}
                      onChange={(e) => setCreditForm({ ...creditForm, dateOfCredit: e.target.value })}
                    />
                  </div>
                  <div>
                    <label>Expected pay date</label>
                    <input
                      type="date"
                      value={creditForm.expectedPayDate}
                      onChange={(e) => setCreditForm({ ...creditForm, expectedPayDate: e.target.value })}
                    />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" style={{ marginTop: "0.5rem" }}>
                  Add credit
                </button>
              </form>
            </div>
            <div className="card">
              <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Record payment</h2>
              <form onSubmit={addPayment}>
                <div style={{ marginBottom: "0.5rem" }}>
                  <label>Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={payForm.amount}
                    onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                    required
                  />
                </div>
                <div style={{ marginBottom: "0.5rem" }}>
                  <label>Date paid</label>
                  <input
                    type="date"
                    value={payForm.paidAt}
                    onChange={(e) => setPayForm({ ...payForm, paidAt: e.target.value })}
                  />
                </div>
                <div style={{ marginBottom: "0.5rem" }}>
                  <label>Link to invoice (optional)</label>
                  <select value={payForm.invoiceId} onChange={(e) => setPayForm({ ...payForm, invoiceId: e.target.value })}>
                    <option value="">— Not linked —</option>
                    {invoices.map((inv) => (
                      <option key={inv._id} value={inv._id}>
                        #{inv.invoiceNumber} · {new Date(inv.date).toLocaleDateString()} · {formatMoney(inv.total)}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom: "0.5rem" }}>
                  <label>Note (optional)</label>
                  <input value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} />
                </div>
                <button type="submit" className="btn btn-primary">
                  Add payment
                </button>
              </form>
            </div>
          </div>

          <div className="card" style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
              <span style={{ fontSize: "0.95rem", color: "var(--muted)" }}>
                Account statement — export with the same table layout (Dis, amounts, totals).
              </span>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-ghost" onClick={handlePrintReport}>
                  Print
                </button>
                <button type="button" className="btn btn-ghost" onClick={handleDownloadPdf}>
                  Download PDF
                </button>
                <button type="button" className="btn btn-primary" onClick={handleDownloadWord}>
                  Download Word
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-2">
            <div className="card">
              <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Credit history</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Due</th>
                      <th>Desc</th>
                      <th>Invoice</th>
                      <th>Amt</th>
                      {isAdmin && <th className="no-print" />}
                    </tr>
                  </thead>
                  <tbody>
                    {credits.map((cr) => {
                      const due = new Date(cr.expectedPayDate);
                      const overdue = due < new Date(new Date().setHours(0, 0, 0, 0));
                      return (
                        <tr key={cr._id}>
                          <td>{toInputDate(cr.dateOfCredit)}</td>
                          <td>
                            {toInputDate(cr.expectedPayDate)}
                            {overdue && customer.balance > 0 && (
                              <span className="badge badge-danger no-print" style={{ marginLeft: 4 }}>
                                overdue
                              </span>
                            )}
                          </td>
                          <td>{cr.description}</td>
                          <td>
                            {cr.invoice ? (
                              <Link to={`/invoices/${cr.invoice}`}>View</Link>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>{formatMoney(cr.amount)}</td>
                          {isAdmin && (
                            <td className="no-print">
                              <button type="button" className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem" }} onClick={() => delCredit(cr._id)}>
                                Delete
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 600, background: "var(--bg-soft)" }}>
                      <td colSpan={4} style={{ textAlign: "right", color: "var(--muted)" }}>
                        Total credit
                      </td>
                      <td>{formatMoney(totalCreditAmt)}</td>
                      {isAdmin && <td className="no-print" />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <div className="card">
              <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Payments</h2>
              <p className="no-print" style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0 0 0.5rem" }}>
                <strong>Dis</strong>: <strong>Payment recorded</strong> (Add payment) or <strong>At sale pay</strong> (cash on the invoice when sold).{" "}
                <strong>Total payments</strong> is the sum of every amount in this table.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Dis</th>
                      <th>Note</th>
                      <th>Invoice</th>
                      <th>Amt</th>
                      {isAdmin && <th className="no-print" />}
                    </tr>
                  </thead>
                  <tbody>
                    {paymentRowsMerged.length === 0 ? (
                      <tr>
                        <td colSpan={isAdmin ? 6 : 5} style={{ color: "var(--muted)" }}>
                          No payments yet.
                        </td>
                      </tr>
                    ) : (
                      paymentRowsMerged.map((row) =>
                        row.kind === "entry" ? (
                          <tr key={row.key}>
                            <td>{toInputDate(row.entry.paidAt)}</td>
                            <td>Payment recorded</td>
                            <td>{row.entry.note || "—"}</td>
                            <td>
                              {row.entry.invoice ? (
                                <Link to={`/invoices/${row.entry.invoice}`}>
                                  #
                                  {invoices.find((i) => String(i._id) === String(row.entry.invoice))?.invoiceNumber ?? "—"}
                                </Link>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>{formatMoney(row.entry.amount)}</td>
                            {isAdmin && (
                              <td className="no-print">
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  style={{ padding: "0.25rem 0.5rem" }}
                                  onClick={() => delPayment(row.entry._id)}
                                >
                                  Delete
                                </button>
                              </td>
                            )}
                          </tr>
                        ) : (
                          <tr key={row.key}>
                            <td>{toInputDate(row.invoice.date)}</td>
                            <td>At sale pay</td>
                            <td style={{ color: "var(--muted)" }}>—</td>
                            <td>
                              <Link to={`/invoices/${row.invoice._id}`}>#{row.invoice.invoiceNumber}</Link>
                            </td>
                            <td>{formatMoney(row.invoice.paidAtSale)}</td>
                            {isAdmin && (
                              <td className="no-print">
                                <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>—</span>
                              </td>
                            )}
                          </tr>
                        )
                      )
                    )}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 600, background: "var(--bg-soft)" }}>
                      <td colSpan={4} style={{ textAlign: "right", color: "var(--muted)" }}>
                        Total payments
                      </td>
                      <td>{formatMoney(totalPaymentAmt)}</td>
                      {isAdmin && <td className="no-print" />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
