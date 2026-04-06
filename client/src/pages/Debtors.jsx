import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { dashboardApi } from "../api.js";
import { formatMoney } from "../util.js";

export default function Debtors() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    dashboardApi
      .summary()
      .then(setData)
      .catch((e) => setErr(e.message));
  }, []);

  if (err) {
    return <p style={{ color: "var(--danger)" }}>{err}</p>;
  }
  if (!data) {
    return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  }

  const debtors = data.debtors || [];
  const total = data.totalOwedToday ?? 0;

  return (
    <div>
      <p style={{ marginTop: 0 }}>
        <Link to="/">← Dashboard</Link>
      </p>
      <h1 style={{ marginTop: 0 }}>Deynta invoice (unpaid + partial)</h1>
      <p style={{ color: "var(--muted)", maxWidth: 640, marginBottom: "1.25rem" }}>
        Wadarta &quot;On credit&quot; invoice-yada aan la dhammaystirin, macaamiil kasta. Riix magaca si aad u furto profile-kiisa.
      </p>

      <div className="card" style={{ marginBottom: "1rem", borderTop: "3px solid var(--danger)" }}>
        <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Total debt</div>
        <div style={{ fontSize: "1.75rem", fontWeight: 700, color: total > 0.004 ? "var(--danger)" : "inherit" }}>{formatMoney(total)}</div>
        <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.35rem" }}>
          {data.customersWithDebt ?? debtors.length} macaamiil
        </div>
      </div>

      {debtors.length === 0 ? (
        <div className="card">
          <p style={{ color: "var(--muted)", margin: 0 }}>Ma jiro deyn invoice ah hadda.</p>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>On credit (invoice sum)</th>
                </tr>
              </thead>
              <tbody>
                {debtors.map((d) => (
                  <tr key={String(d.customerId)}>
                    <td>
                      <Link to={`/customers/${d.customerId}`}>{d.fullName}</Link>
                    </td>
                    <td>{d.phone}</td>
                    <td>
                      <strong>{formatMoney(d.balance)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p style={{ marginTop: "1rem" }}>
        <Link to="/invoices" className="btn btn-primary">
          Dhamaan invoice-yada
        </Link>
      </p>
    </div>
  );
}
