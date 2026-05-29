import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { invoicesApi } from "../api.js";
import { formatMoney, invoiceMatchesFilter, enteredByLabel, invoiceLaterPayments, BALANCE_EPS } from "../util.js";

function statusLabel(s) {
  if (s === "paid") return <span className="badge badge-ok">Paid</span>;
  if (s === "partial") return <span className="badge" style={{ background: "#fff3e0", color: "#b45309" }}>Partial</span>;
  return <span className="badge badge-danger">Unpaid</span>;
}

export default function Invoices() {
  const [list, setList] = useState([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

  const filtered = useMemo(
    () => list.filter((inv) => invoiceMatchesFilter(inv, q, { status: statusFilter, date: dateFilter })),
    [list, q, statusFilter, dateFilter]
  );

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
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link to="/invoices/open" className="btn btn-ghost">
            Open invoices
          </Link>
          <Link to="/invoices/new" className="btn btn-primary">
            New invoice
          </Link>
        </div>
      </div>
      <p style={{ color: "var(--muted)", marginTop: "0.5rem", maxWidth: 640 }}>
        Register every sale with line items. If the customer pays in full (cash or card), no credit is recorded. If something stays
        unpaid, choose an existing customer so the amount is added to their balance — you can record further payments on their
        customer page.
      </p>
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
      <div className="card" style={{ marginTop: "1rem" }}>
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            alignItems: "flex-end",
            marginBottom: "0.75rem",
          }}
        >
          <div style={{ flex: "1 1 220px", minWidth: 200 }}>
            <label htmlFor="inv-search">Search invoices</label>
            <input
              id="inv-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Customer, invoice #, user, status…"
            />
          </div>
          <div style={{ flex: "0 1 160px", minWidth: 150 }}>
            <label htmlFor="inv-date">Invoice date</label>
            <input id="inv-date" type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          </div>
          <div style={{ flex: "0 1 160px", minWidth: 140 }}>
            <label htmlFor="inv-status">Status</label>
            <select id="inv-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>
          {(q.trim() || statusFilter !== "all" || dateFilter) && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginBottom: 2 }}
              onClick={() => {
                setQ("");
                setStatusFilter("all");
                setDateFilter("");
              }}
            >
              Clear
            </button>
          )}
        </div>
        {list.length > 0 && (
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", color: "var(--muted)" }}>
            Showing {filtered.length} of {list.length} invoice{list.length === 1 ? "" : "s"}
          </p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Paid at sale</th>
                <th>Later payments</th>
                <th>Remaining</th>
                <th>Status</th>
                <th>Entered by</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && list.length > 0 ? (
                <tr>
                  <td colSpan={9} style={{ color: "var(--muted)" }}>
                    No invoices match your search.
                  </td>
                </tr>
              ) : (
              filtered.map((inv) => (
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
                  <td>
                    {invoiceLaterPayments(inv) > BALANCE_EPS ? formatMoney(invoiceLaterPayments(inv)) : "—"}
                  </td>
                  <td>{inv.creditAmount > 0 ? formatMoney(inv.creditAmount) : "—"}</td>
                  <td>{statusLabel(inv.paymentStatus)}</td>
                  <td>{enteredByLabel(inv)}</td>
                </tr>
              ))
              )}
            </tbody>
          </table>
        </div>
        {list.length === 0 && !err && <p style={{ color: "var(--muted)", margin: 0 }}>No invoices yet.</p>}
      </div>
    </div>
  );
}
