import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { invoicesApi } from "../api.js";
import { formatMoney, enteredByLabel, invoiceLaterPayments, BALANCE_EPS } from "../util.js";

const PAGE_SIZE = 50;

function statusLabel(s) {
  if (s === "paid") return <span className="badge badge-ok">Paid</span>;
  if (s === "partial") return <span className="badge" style={{ background: "#fff3e0", color: "#b45309" }}>Partial</span>;
  return <span className="badge badge-danger">Unpaid</span>;
}

/** Page numbers with gaps for large lists, e.g. 1 … 4 5 6 … 12 */
function buildPageList(current, totalPages) {
  if (totalPages <= 1) return [1];
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const set = new Set([1, totalPages, current, current - 1, current + 1]);
  const nums = [...set].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    if (i > 0 && nums[i] - nums[i - 1] > 1) out.push("…");
    out.push(nums[i]);
  }
  return out;
}

export default function Invoices() {
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageList = useMemo(() => buildPageList(page, totalPages), [page, totalPages]);
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const fetchInvoices = useCallback(async () => {
    const params = {
      limit: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(statusFilter !== "all" ? { status: statusFilter } : {}),
      ...(dateFilter ? { date: dateFilter } : {}),
    };
    const data = await invoicesApi.list(params);
    const items = data?.items ?? (Array.isArray(data) ? data : []);
    const count = data?.total ?? items.length;
    setTotal(count);
    setList(items);
    const maxPage = Math.max(1, Math.ceil(count / PAGE_SIZE));
    if (page > maxPage) setPage(maxPage);
  }, [page, q, statusFilter, dateFilter]);

  useEffect(() => {
    setLoading(true);
    setErr("");
    fetchInvoices()
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [fetchInvoices]);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  function onFilterChange(setter) {
    return (e) => {
      setter(e.target.value);
      setPage(1);
    };
  }

  function goToPage(p) {
    const next = Math.min(Math.max(1, p), totalPages);
    if (next !== page) {
      setPage(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function clearFilters() {
    setSearchInput("");
    setQ("");
    setStatusFilter("all");
    setDateFilter("");
    setPage(1);
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
        Page 1 shows the latest {PAGE_SIZE} invoices. Search finds invoices across the whole database.
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
            <input id="inv-date" type="date" value={dateFilter} onChange={onFilterChange(setDateFilter)} />
          </div>
          <div style={{ flex: "0 1 160px", minWidth: 140 }}>
            <label htmlFor="inv-status">Status</label>
            <select id="inv-status" value={statusFilter} onChange={onFilterChange(setStatusFilter)}>
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
            Showing {rangeStart}–{rangeEnd} of {total} invoice{total === 1 ? "" : "s"}
            {q.trim() ? ` matching “${q.trim()}”` : ""}
            {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ""}
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
        {!loading && totalPages > 1 && (
          <nav
            aria-label="Invoice pages"
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.35rem",
              marginTop: "1.25rem",
            }}
          >
            <button
              type="button"
              className="btn btn-ghost"
              disabled={page <= 1 || loading}
              onClick={() => goToPage(page - 1)}
            >
              ← Previous
            </button>
            {pageList.map((item, i) =>
              item === "…" ? (
                <span key={`gap-${i}`} style={{ padding: "0 0.25rem", color: "var(--muted)" }}>
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={item === page ? "btn btn-primary" : "btn btn-ghost"}
                  disabled={loading}
                  onClick={() => goToPage(item)}
                  style={{ minWidth: 40 }}
                >
                  {item}
                </button>
              )
            )}
            <button
              type="button"
              className="btn btn-ghost"
              disabled={page >= totalPages || loading}
              onClick={() => goToPage(page + 1)}
            >
              Next →
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
