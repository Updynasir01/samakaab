import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { invoicesApi } from "../api.js";
import { formatMoney, enteredByLabel, invoiceLaterPayments, BALANCE_EPS } from "../util.js";

const PAGE_SIZE = 100;

function statusLabel(s) {
  if (s === "paid") return <span className="badge badge-ok">Paid</span>;
  if (s === "partial") return <span className="badge" style={{ background: "#fff3e0", color: "#b45309" }}>Partial</span>;
  return <span className="badge badge-danger">Unpaid</span>;
}

export default function Invoices() {
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

  const hasMore = list.length < total;
  const showingAll = total > 0 && list.length >= total;

  const fetchPage = useCallback(
    async ({ skip = 0, append = false, limit = PAGE_SIZE } = {}) => {
      const params = {
        limit,
        skip,
        ...(q.trim() ? { q: q.trim() } : {}),
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        ...(dateFilter ? { date: dateFilter } : {}),
      };
      const data = await invoicesApi.list(params);
      const items = data?.items ?? (Array.isArray(data) ? data : []);
      const count = data?.total ?? items.length;
      setTotal(count);
      setList((prev) => (append ? [...prev, ...items] : items));
      return { items, total: count };
    },
    [q, statusFilter, dateFilter]
  );

  useEffect(() => {
    setLoading(true);
    setErr("");
    fetchPage({ skip: 0, append: false })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [fetchPage]);

  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setErr("");
    try {
      await fetchPage({ skip: list.length, append: true });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function showAll() {
    if (loadingMore || showingAll) return;
    setLoadingMore(true);
    setErr("");
    try {
      await fetchPage({ skip: 0, append: false, limit: Math.min(total || PAGE_SIZE, 500) });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoadingMore(false);
    }
  }

  function clearFilters() {
    setSearchInput("");
    setQ("");
    setStatusFilter("all");
    setDateFilter("");
  }

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
        Register every sale with line items. Search finds invoices across the whole database — not only the first page.
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
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Customer, invoice #, order, note…"
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
          {(searchInput.trim() || statusFilter !== "all" || dateFilter) && (
            <button type="button" className="btn btn-ghost" style={{ marginBottom: 2 }} onClick={clearFilters}>
              Clear
            </button>
          )}
        </div>
        {!loading && total > 0 && (
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", color: "var(--muted)" }}>
            Showing {list.length} of {total} invoice{total === 1 ? "" : "s"}
            {q.trim() ? ` matching “${q.trim()}”` : ""}
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
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ color: "var(--muted)" }}>
                    Loading invoices…
                  </td>
                </tr>
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ color: "var(--muted)" }}>
                    {q.trim() || statusFilter !== "all" || dateFilter
                      ? "No invoices match your search."
                      : "No invoices yet."}
                  </td>
                </tr>
              ) : (
                list.map((inv) => (
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
        {!loading && hasMore && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <button type="button" className="btn" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? "Loading…" : `Load more (${total - list.length} remaining)`}
            </button>
            <button type="button" className="btn btn-ghost" disabled={loadingMore} onClick={showAll}>
              Show all ({total})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
