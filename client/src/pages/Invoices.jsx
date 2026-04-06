import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { invoicesApi } from "../api.js";
import { formatMoney } from "../util.js";

function statusLabel(s) {
  if (s === "paid") return <span className="badge badge-ok">Paid</span>;
  if (s === "partial") return <span className="badge" style={{ background: "#fff3e0", color: "#b45309" }}>Partial</span>;
  return <span className="badge badge-danger">Unpaid</span>;
}

export default function Invoices() {
  const [list, setList] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    invoicesApi
      .list(100)
      .then(setList)
      .catch((e) => setErr(e.message));
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 style={{ margin: 0 }}>Invoices</h1>
        <Link to="/invoices/new" className="btn btn-primary">
          New invoice
        </Link>
      </div>
      <p style={{ color: "var(--muted)", marginTop: "0.5rem", maxWidth: 640 }}>
        Register every sale with line items. If the customer pays in full (cash or card), no credit is recorded. If something stays
        unpaid, choose an existing customer so the amount is added to their balance — you can record further payments on their
        customer page.
      </p>
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
      <div className="card" style={{ marginTop: "1rem" }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Paid at sale</th>
                <th>On credit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((inv) => (
                <tr key={inv._id}>
                  <td>
                    <Link to={`/invoices/${inv._id}`}>#{inv.invoiceNumber}</Link>
                  </td>
                  <td>{new Date(inv.date).toLocaleDateString()}</td>
                  <td>
                    {inv.customer ? (
                      <Link to={`/customers/${inv.customer._id}`}>{inv.customer.fullName}</Link>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>Walk-in</span>
                    )}
                  </td>
                  <td>{formatMoney(inv.total)}</td>
                  <td>{formatMoney(inv.paidAtSale)}</td>
                  <td>{inv.creditAmount > 0 ? formatMoney(inv.creditAmount) : "—"}</td>
                  <td>{statusLabel(inv.paymentStatus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.length === 0 && !err && <p style={{ color: "var(--muted)", margin: 0 }}>No invoices yet.</p>}
      </div>
    </div>
  );
}
