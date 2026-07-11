import { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { invoicesApi } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useCompanyProfile } from "../companySettings.jsx";
import { formatMoney, enteredByLabel, invoiceLaterPayments, BALANCE_EPS } from "../util.js";
import { buildInvoiceHtml, printInvoiceFromHtml } from "../invoiceExport.js";
import {
  buildInvoiceWhatsAppCaption,
  invoicePdfFilename,
  shareHtmlPdfViaWhatsApp,
} from "../whatsappShare.js";

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { profile } = useCompanyProfile();
  const [inv, setInv] = useState(null);
  const [err, setErr] = useState("");
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [whatsAppBusy, setWhatsAppBusy] = useState(false);
  const selectAllRef = useRef(null);

  useEffect(() => {
    invoicesApi
      .get(id)
      .then(setInv)
      .catch((e) => setErr(e.message));
  }, [id]);

  async function remove() {
    if (!isAdmin || !window.confirm("Delete this invoice and its linked credit / payment-at-sale records?")) return;
    try {
      await invoicesApi.remove(id);
      navigate("/invoices");
    } catch (e) {
      setErr(e.message);
    }
  }

  function printDoc(kind) {
    const html = buildInvoiceHtml(inv, { kind, company: profile });
    printInvoiceFromHtml(html);
  }

  async function sendInvoiceWhatsApp(mode = "app") {
    if (!inv?.customer?.phone || whatsAppBusy) {
      if (!inv?.customer?.phone) window.alert("This invoice has no customer phone number.");
      return;
    }
    setWhatsAppBusy(true);
    setErr("");
    try {
      const html = buildInvoiceHtml(inv, { kind: "invoice", company: profile });
      await shareHtmlPdfViaWhatsApp({
        phone: inv.customer.phone,
        html,
        filename: invoicePdfFilename(inv),
        caption: buildInvoiceWhatsAppCaption({
          customerName: inv.customer?.fullName || "Walk-in",
          brandName: profile.brandName || profile.legalName,
          invoiceNumber: inv.invoiceNumber,
          isWalkIn: !inv.customer,
        }),
        mode,
      });
    } catch (e) {
      setErr(e.message || "Could not create PDF for WhatsApp.");
    } finally {
      setWhatsAppBusy(false);
    }
  }

  async function toggleDelivered(lineItemId, delivered) {
    if (deliveryBusy) return;
    try {
      const next = await invoicesApi.setLineDelivered(inv._id, lineItemId, delivered);
      setInv(next);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function setAllDelivered(delivered) {
    if (deliveryBusy || !inv) return;
    setDeliveryBusy(true);
    setErr("");
    try {
      const next = await invoicesApi.setAllDelivered(inv._id, delivered);
      setInv(next);
    } catch (e) {
      setErr(e.message);
    } finally {
      setDeliveryBusy(false);
    }
  }

  const lineItems = inv?.lineItems || [];
  const allDelivered = lineItems.length > 0 && lineItems.every((li) => li.delivered === true);
  const someDelivered = lineItems.some((li) => li.delivered === true);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someDelivered && !allDelivered;
    }
  }, [someDelivered, allDelivered, inv]);

  if (err && !inv) {
    return <p style={{ color: "var(--danger)" }}>{err}</p>;
  }
  if (!inv) {
    return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  }

  return (
    <div>
      <p style={{ marginTop: 0 }}>
        <Link to="/invoices">← Invoices</Link>
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ margin: 0 }}>Invoice #{inv.invoiceNumber}</h1>
          <p style={{ color: "var(--muted)", margin: "0.25rem 0 0" }}>
            {new Date(inv.date).toLocaleString()}
            {inv.orderNumber ? ` · Order: ${inv.orderNumber}` : ""}
            {inv.createdBy ? ` · Entered by: ${inv.createdBy}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link to={`/invoices/${id}/edit`} className="btn btn-primary">
            Edit invoice
          </Link>
          {isAdmin && (
            <button type="button" className="btn btn-danger" onClick={remove}>
              Delete invoice
            </button>
          )}
        </div>
      </div>
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      <div className="card" style={{ marginTop: "1rem" }}>
        <p style={{ margin: "0 0 0.5rem" }}>
          <strong>Status:</strong> {inv.paymentStatus} · <strong>Total:</strong> {formatMoney(inv.total)} ·{" "}
          <strong>Paid at sale:</strong> {formatMoney(inv.paidAtSale)} · <strong>Later payments:</strong>{" "}
          {invoiceLaterPayments(inv) > BALANCE_EPS ? formatMoney(invoiceLaterPayments(inv)) : "—"}{" "}
          · <strong>Remaining:</strong>{" "}
          {inv.creditAmount > 0 ? formatMoney(inv.creditAmount) : "—"}
        </p>
        {inv.customer ? (
          <p style={{ margin: 0 }}>
            <strong>Customer:</strong>{" "}
            <Link to={`/customers/${inv.customer._id}`}>
              {inv.customer.fullName} ({inv.customer.phone})
            </Link>
          </p>
        ) : (
          <p style={{ margin: 0, color: "var(--muted)" }}>
            Walk-in cash receipt
            {inv.receiptTakerName ? (
              <>
                {" "}
                for <strong style={{ color: "var(--text)" }}>{inv.receiptTakerName}</strong>
              </>
            ) : null}{" "}
            (paid in full at checkout — no customer balance).
          </p>
        )}
        {inv.note && (
          <p style={{ margin: "0.75rem 0 0" }}>
            <strong>Note:</strong> {inv.note}
          </p>
        )}
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Print &amp; share</h2>
        <p style={{ margin: "0.25rem 0 0.75rem", color: "var(--muted)", fontSize: "0.9rem", maxWidth: 720 }}>
          Invoice shows prices and totals. Delivery note hides prices and totals (quantities only). WhatsApp sends a PDF that matches the printed invoice.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" onClick={() => printDoc("invoice")}>
            Print invoice
          </button>
          <button type="button" className="btn" onClick={() => printDoc("delivery")}>
            Print delivery note
          </button>
          {inv.customer?.phone && (
            <>
              <button type="button" className="btn btn-ghost" disabled={whatsAppBusy} onClick={() => sendInvoiceWhatsApp("app")}>
                {whatsAppBusy ? "Preparing PDF…" : "WhatsApp app"}
              </button>
              <button type="button" className="btn btn-ghost" disabled={whatsAppBusy} onClick={() => sendInvoiceWhatsApp("web")}>
                {whatsAppBusy ? "Preparing PDF…" : "WhatsApp Web"}
              </button>
            </>
          )}
        </div>
        {inv.customer?.phone && (
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
            <strong>WhatsApp app</strong> — share sheet can attach the PDF automatically.{" "}
            <strong>WhatsApp Web</strong> — PDF downloads; attach with the paperclip before sending.
          </p>
        )}
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Line items & delivery</h2>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn"
              disabled={deliveryBusy || allDelivered || lineItems.length === 0}
              onClick={() => setAllDelivered(true)}
            >
              Mark all delivered
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={deliveryBusy || !someDelivered}
              onClick={() => setAllDelivered(false)}
            >
              Clear all
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 72, textAlign: "center" }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", cursor: deliveryBusy ? "wait" : "pointer", fontWeight: 600 }}>
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allDelivered}
                      disabled={deliveryBusy || lineItems.length === 0}
                      onChange={(e) => setAllDelivered(e.target.checked)}
                      title={allDelivered ? "Clear all delivery marks" : "Mark all items delivered"}
                    />
                    All
                  </label>
                </th>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Unit price</th>
                <th>Line total</th>
              </tr>
            </thead>
            <tbody>
              {inv.lineItems.map((row, i) => (
                <tr key={i}>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={row.delivered === true}
                      disabled={deliveryBusy}
                      onChange={(e) => toggleDelivered(row._id, e.target.checked)}
                      title="Mark item delivered"
                    />
                  </td>
                  <td>{row.description}</td>
                  <td>{row.quantity}</td>
                  <td>{row.unit || "—"}</td>
                  <td>{formatMoney(row.unitPrice)}</td>
                  <td>{formatMoney(row.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {inv.delivery && (
        <div className="card" style={{ marginTop: "1rem", background: "var(--bg-soft)" }}>
          <p style={{ margin: 0 }}>
            <strong>Delivered:</strong> {inv.delivery.deliveredCount}/{inv.delivery.totalCount} ·{" "}
            <strong>Delivered value:</strong> {formatMoney(inv.delivery.deliveredValue)} · <strong>Remaining value:</strong>{" "}
            {formatMoney(inv.delivery.remainingValue)}
          </p>
        </div>
      )}

      {inv.creditAmount > 0 && inv.customer && (
        <div className="card" style={{ marginTop: "1rem", background: "#f0faf6", borderColor: "var(--accent-dim)" }}>
          <p style={{ margin: 0 }}>
            The unpaid amount is on this customer&apos;s account as credit. Record follow-up payments on{" "}
            <Link to={`/customers/${inv.customer._id}`}>their customer page</Link>.
          </p>
        </div>
      )}
    </div>
  );
}
