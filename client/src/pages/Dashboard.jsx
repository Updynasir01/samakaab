import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { dashboardApi } from "../api.js";
import { formatMoney } from "../util.js";

const COLORS = ["#1a8f6a", "#3b82c4", "#d97706"];

export default function Dashboard() {
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
    return <p style={{ color: "var(--muted)" }}>Loading dashboard…</p>;
  }

  const received = data.pie?.moneyReceived ?? data.moneyReceived ?? data.pie?.totalPaid ?? 0;
  const owedInvoices = data.pie?.outstandingInvoiceDebt ?? data.totalOwedToday ?? 0;
  const pieData = [
    { name: "Money received", value: received },
    { name: "Still owed (invoices)", value: owedInvoices },
  ].filter((d) => d.value > 0.004);

  const barSource =
    data.weeklyMoneyInByDay?.length != null && data.weeklyMoneyInByDay.length > 0
      ? data.weeklyMoneyInByDay
      : (data.weeklyCreditByDay || []).map((d) => ({ date: d.date, total: d.credit }));
  const barData = barSource.map((d) => ({
    name: d.date?.slice(5) || d.date,
    moneyIn: d.total ?? d.credit ?? 0,
  }));

  const hasDebt = (data.totalOwedToday || 0) > 0.004;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Dashboard</h1>

      <div className="grid grid-5" style={{ marginBottom: "1.25rem" }}>
        <div className="card" style={{ borderTop: "3px solid var(--accent)" }}>
          <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Money received (all time)</div>
          <div style={{ fontSize: "1.45rem", fontWeight: 700 }}>{formatMoney(data.moneyReceived ?? data.pie?.totalPaid)}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.35rem" }}>Lacag la helay (wadarta)</div>
          <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.25rem", lineHeight: 1.35 }}>
            Paid at sale + payments recorded on accounts.{" "}
            {data.paidAtSaleAllTime != null && data.paymentsRecordedAllTime != null && (
              <>
                {formatMoney(data.paidAtSaleAllTime)} + {formatMoney(data.paymentsRecordedAllTime)}
              </>
            )}
          </div>
        </div>

        <Link
          to="/debts"
          className="card dashboard-debt-btn"
          style={{
            textAlign: "left",
            width: "100%",
            borderTop: hasDebt ? "3px solid var(--danger)" : "3px solid var(--border)",
            opacity: hasDebt ? 1 : 0.95,
            textDecoration: "none",
            color: "inherit",
            display: "block",
          }}
        >
          <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Total debt (invoice: unpaid + partial)</div>
          <div style={{ fontSize: "1.45rem", fontWeight: 700, color: hasDebt ? "var(--danger)" : "inherit" }}>
            {formatMoney(data.totalOwedToday)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.35rem" }}>
            Wadarta &quot;On credit&quot; invoice-yada aan dhammaystirin —{" "}
            {hasDebt ? "riix si aad u aragto macaamiisha" : "bixi bogga si aad u hubiso"}
          </div>
        </Link>

        <div className="card">
          <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Customers (invoice debt)</div>
          <div style={{ fontSize: "1.45rem", fontWeight: 700 }}>{data.customersWithDebt}</div>
        </div>

        <div className="card">
          <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Overdue follow-ups</div>
          <div style={{ fontSize: "1.45rem", fontWeight: 700, color: data.overdueAlerts?.length ? "var(--danger)" : "inherit" }}>
            {data.overdueAlerts?.length || 0}
          </div>
        </div>

        <div className="card">
          <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>All-time credit given</div>
          <div style={{ fontSize: "1.45rem", fontWeight: 700 }}>{formatMoney(data.pie.totalCredit)}</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: "1.25rem" }}>
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Received vs invoice debt (all time)</h2>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "var(--muted)" }}>
            Total cash in (paid at sale + recorded payments) compared with open invoice balances.
          </p>
          <div style={{ height: 260 }}>
            {pieData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, value }) => `${name}: ${formatMoney(value)}`}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatMoney(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ color: "var(--muted)" }}>No data yet.</p>
            )}
          </div>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Daily money in (last 7 days)</h2>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "var(--muted)" }}>
            Per day: invoice paid-at-sale + payments recorded (same idea as the top card).
          </p>
          <div style={{ height: 260 }}>
            {barData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--muted)" fontSize={0.75} />
                  <YAxis stroke="var(--muted)" fontSize={0.75} />
                  <Tooltip formatter={(v) => formatMoney(v)} />
                  <Bar dataKey="moneyIn" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ color: "var(--muted)" }}>No money in the last week.</p>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Overdue — follow up</h2>
        {data.overdueAlerts?.length ? (
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {data.overdueAlerts.map((a) => (
              <li key={a.creditId} style={{ marginBottom: "0.5rem" }}>
                <span className="badge badge-danger">Overdue</span>{" "}
                <Link to={`/customers/${a.customerId}`}>{a.customerName}</Link> — {a.message}{" "}
                <span style={{ color: "var(--muted)" }}>
                  ({formatMoney(a.amount)} · {a.description})
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "var(--muted)", margin: 0 }}>No overdue credits with outstanding balance.</p>
        )}
      </div>
    </div>
  );
}
