import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { invoicesApi } from "../api.js";
import { useAuth } from "../auth.jsx";
import { formatMoney } from "../util.js";

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [inv, setInv] = useState(null);
  const [err, setErr] = useState("");

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
          <p style={{ color: "var(--muted)", margin: "0.25rem 0 0" }}>{new Date(inv.date).toLocaleString()}</p>
        </div>
        {isAdmin && (
          <button type="button" className="btn btn-danger" onClick={remove}>
            Delete invoice
          </button>
        )}
      </div>
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      <div className="card" style={{ marginTop: "1rem" }}>
        <p style={{ margin: "0 0 0.5rem" }}>
          <strong>Status:</strong> {inv.paymentStatus} · <strong>Total:</strong> {formatMoney(inv.total)} ·{" "}
          <strong>Paid at sale:</strong> {formatMoney(inv.paidAtSale)} · <strong>On credit:</strong>{" "}
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
            Walk-in sale (paid in full at checkout — no customer balance).
          </p>
        )}
        {inv.note && (
          <p style={{ margin: "0.75rem 0 0" }}>
            <strong>Note:</strong> {inv.note}
          </p>
        )}
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Line items</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Line total</th>
              </tr>
            </thead>
            <tbody>
              {inv.lineItems.map((row, i) => (
                <tr key={i}>
                  <td>{row.description}</td>
                  <td>{row.quantity}</td>
                  <td>{formatMoney(row.unitPrice)}</td>
                  <td>{formatMoney(row.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
