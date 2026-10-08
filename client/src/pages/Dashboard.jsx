import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { dashboardApi } from "../api.js";
import { useCompanyProfile } from "../companySettings.jsx";
import { openWhatsAppChat } from "../whatsappShare.js";
import { formatMoney } from "../util.js";

const COLORS = ["#1a8f6a", "#3b82c4", "#d97706"];
const CALL_LIST_LIMIT = 6;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function daysLate(value) {
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return 0;
  const iso = due.toISOString().slice(0, 10);
  const [y, m, d] = iso.split("-").map(Number);
  const dueDay = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - dueDay.getTime()) / 86400000));
}

function shortDueLabel(value) {
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return "";
  const iso = due.toISOString().slice(0, 10);
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1] || ""}`.trim();
}

function shortBillLabel(description) {
  const text = String(description || "").replace(/\s+/g, " ").trim();
  const numbered = text.match(/invoice\s*#\s*(\d+)/i);
  if (numbered) return `Invoice #${numbered[1]}`;
  const inv = text.match(/\bINV-(\d+)/i);
  if (inv) return `INV-${inv[1]}`;
  if (/open balance/i.test(text)) return "Open balance";
  const head = text.split(":")[0].trim();
  if (!head) return "Credit";
  return head.length > 36 ? `${head.slice(0, 34)}…` : head;
}

function groupCalls(alerts) {
  const map = new Map();
  for (const alert of alerts || []) {
    const id = String(alert.customerId || "");
    if (!id) continue;
    if (!map.has(id)) {
      map.set(id, {
        customerId: id,
        customerName: alert.customerName || "Customer",
        phone: alert.phone || "",
        amount: 0,
        bills: [],
      });
    }
    const person = map.get(id);
    if (!person.phone && alert.phone) person.phone = alert.phone;
    const amount = Number(alert.amount) || 0;
    person.amount += amount;
    person.bills.push({
      creditId: String(alert.creditId || `${id}-${person.bills.length}`),
      amount,
      expectedPayDate: alert.expectedPayDate,
      daysLate: daysLate(alert.expectedPayDate),
      label: shortBillLabel(alert.description),
    });
  }

  return [...map.values()]
    .map((person) => {
      person.bills.sort((a, b) => b.amount - a.amount || b.daysLate - a.daysLate);
      person.daysLate = person.bills.reduce((max, bill) => Math.max(max, bill.daysLate), 0);
      const oldest = [...person.bills].sort((a, b) => b.daysLate - a.daysLate)[0];
      person.oldestDue = oldest?.expectedPayDate;
      return person;
    })
    .sort((a, b) => b.amount - a.amount || b.daysLate - a.daysLate);
}

function followUpMessage(person, brand) {
  const due = shortDueLabel(person.oldestDue);
  const bills = person.bills.length === 1 ? "1 bill" : `${person.bills.length} bills`;
  const dueBit = due ? `, due ${due}` : "";
  return `Asc ${person.customerName}, this is ${brand}. Your balance of ${formatMoney(person.amount)} is overdue (${bills}${dueBit}). Please arrange payment. Mahadsanid.`;
}

export default function Dashboard() {
  const { profile } = useCompanyProfile();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [showAllCalls, setShowAllCalls] = useState(false);
  const [openBills, setOpenBills] = useState({});
  const calls = useMemo(() => groupCalls(data?.overdueAlerts), [data]);

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
  const visibleCalls = showAllCalls ? calls : calls.slice(0, CALL_LIST_LIMIT);
  const hiddenCallCount = Math.max(0, calls.length - visibleCalls.length);
  const overdueTotal = calls.reduce((sum, person) => sum + person.amount, 0);
  const brand = profile.brandName || profile.legalName || "Samakaab";

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Dashboard</h1>

      <div className="grid grid-5" style={{ marginBottom: "1.25rem" }}>
        <div className="card" style={{ borderTop: "3px solid var(--accent)" }}>
          <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Money received (all time)</div>
          <div style={{ fontSize: "1.45rem", fontWeight: 700 }}>{formatMoney(data.moneyReceived ?? data.pie?.totalPaid)}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.35rem" }}>Lacag la helay (wadarta)</div>
          <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.25rem", lineHeight: 1.35 }}>
            Paid at sale + later payments (duplicates excluded).{" "}
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

        <a href="#who-to-call" className="card dashboard-debt-btn" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
          <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>People to call</div>
          <div style={{ fontSize: "1.45rem", fontWeight: 700, color: calls.length ? "var(--danger)" : "inherit" }}>
            {calls.length}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.35rem" }}>
            {data.overdueAlerts?.length
              ? `${data.overdueAlerts.length} overdue bill${data.overdueAlerts.length === 1 ? "" : "s"} — start at the top`
              : "No one to call today"}
          </div>
        </a>

        <div className="card">
          <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>All-time credit given</div>
          <div style={{ fontSize: "1.45rem", fontWeight: 700 }}>{formatMoney(data.pie.totalCredit)}</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: "1.25rem" }}>
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Received vs invoice debt (all time)</h2>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "var(--muted)" }}>
            Open invoice credit only (excludes manual account credits). Account balance total may differ.
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

      <div className="card" id="who-to-call">
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Who to call</h2>
        {calls.length ? (
          <>
            <p style={{ margin: "0 0 0.85rem", fontSize: "0.85rem", color: "var(--muted)" }}>
              {calls.length} {calls.length === 1 ? "person" : "people"} · {formatMoney(overdueTotal)} still late. Call from the top — largest balance first.
            </p>
            <ol className="call-list">
              {visibleCalls.map((person, index) => {
                const isFirst = index === 0;
                const several = person.bills.length > 1;
                const open = Boolean(openBills[person.customerId]);
                const lateLabel = person.daysLate === 1 ? "1 day late" : `${person.daysLate} days late`;
                return (
                  <li key={person.customerId} className={isFirst ? "call-row is-first" : "call-row"}>
                    <div className="call-rank" aria-hidden="true">{index + 1}</div>
                    <div>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem" }}>
                        <Link className="call-name" to={`/customers/${person.customerId}`}>
                          {person.customerName}
                        </Link>
                        {isFirst && <span className="badge badge-danger">Call first</span>}
                      </div>
                      <div className="call-meta">
                        <span className="call-late">{lateLabel}</span>
                        <span>·</span>
                        {several ? (
                          <button
                            type="button"
                            className="call-toggle"
                            aria-expanded={open}
                            onClick={() =>
                              setOpenBills((current) => ({
                                ...current,
                                [person.customerId]: !current[person.customerId],
                              }))
                            }
                          >
                            {person.bills.length} bills {open ? "▴" : "▾"}
                          </button>
                        ) : (
                          <span>{person.bills[0]?.label}</span>
                        )}
                      </div>
                    </div>
                    <div className="call-side">
                      <div className="call-amount">{formatMoney(person.amount)}</div>
                      <div className="call-actions">
                        {person.phone ? (
                          <>
                            <a className="btn btn-primary" href={`tel:${person.phone}`}>
                              Call
                            </a>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => openWhatsAppChat(person.phone, followUpMessage(person, brand))}
                            >
                              WhatsApp
                            </button>
                          </>
                        ) : (
                          <Link className="btn" to={`/customers/${person.customerId}`}>
                            Add phone
                          </Link>
                        )}
                      </div>
                    </div>
                    {several && open && (
                      <ul className="call-bills">
                        {person.bills.map((bill) => (
                          <li key={bill.creditId}>
                            <span>
                              {bill.label}
                              {shortDueLabel(bill.expectedPayDate) ? ` · due ${shortDueLabel(bill.expectedPayDate)}` : ""}
                              {bill.daysLate ? ` · ${bill.daysLate}d late` : ""}
                            </span>
                            <strong style={{ color: "var(--text)" }}>{formatMoney(bill.amount)}</strong>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
            {hiddenCallCount > 0 && (
              <button type="button" className="btn" style={{ marginTop: "0.75rem" }} onClick={() => setShowAllCalls(true)}>
                Show {hiddenCallCount} more
              </button>
            )}
            {showAllCalls && calls.length > CALL_LIST_LIMIT && (
              <button type="button" className="btn btn-ghost" style={{ marginTop: "0.75rem" }} onClick={() => setShowAllCalls(false)}>
                Show top {CALL_LIST_LIMIT} only
              </button>
            )}
          </>
        ) : (
          <p style={{ color: "var(--muted)", margin: 0 }}>No overdue credits with outstanding balance.</p>
        )}
      </div>
    </div>
  );
}
