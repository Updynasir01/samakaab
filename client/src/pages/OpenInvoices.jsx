import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { invoicesApi } from "../api.js";
import { formatMoney } from "../util.js";

export default function OpenInvoices() {
  const [list, setList] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    setErr("");
    invoicesApi
      .open(150)
      .then(setList)
      .catch((e) => setErr(e.message));
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 style={{ margin: 0 }}>Open invoices</h1>
        <Link to="/invoices" className="btn btn-ghost">
          All invoices
        </Link>
      </div>
      <p style={{ color: "var(--muted)", marginTop: "0.5rem", maxWidth: 760 }}>
        Open invoices are invoices where <strong>not all items are delivered</strong> (for example 7/8 delivered).
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
                <th>Delivered</th>
                <th>Delivered value</th>
                <th>Remaining value</th>
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
                  <td>
                    {inv.delivery ? (
                      <>
                        {inv.delivery.deliveredCount}/{inv.delivery.totalCount}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{formatMoney(inv.delivery?.deliveredValue ?? 0)}</td>
                  <td>{formatMoney(inv.delivery?.remainingValue ?? 0)}</td>
                  <td>{inv.paymentStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.length === 0 && !err && <p style={{ color: "var(--muted)", margin: 0 }}>No open invoices.</p>}
      </div>
    </div>
  );
}

