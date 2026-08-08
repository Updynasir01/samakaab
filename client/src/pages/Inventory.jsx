import { useCallback, useEffect, useMemo, useState } from "react";
import { inventoryApi } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useCompanyProfile } from "../companySettings.jsx";
import { formatMoney, todayISO, toInputDate } from "../util.js";
import {
  buildInventoryListHtml,
  buildProductStockCardHtml,
  buildStockInReceiptHtml,
  downloadInventoryCsv,
  filterInventoryProducts,
  inventoryUnitLabel,
  printInventoryHtml,
} from "../inventoryExport.js";

const UNITS = [
  { value: "bottle", label: "Bottle" },
  { value: "box", label: "Box" },
  { value: "kg", label: "Kg" },
  { value: "piece", label: "Piece" },
];

function emptyProductForm() {
  return { name: "", unit: "bottle", sellPrice: "", lowStockThreshold: "10", note: "" };
}

function emptyStockIn() {
  return {
    quantity: "",
    unitCost: "",
    expiryDate: "",
    supplier: "",
    receivedAt: todayISO(),
    note: "",
  };
}

export default function Inventory() {
  const { isAdmin } = useAuth();
  const { profile } = useCompanyProfile();
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [listFilter, setListFilter] = useState("all");
  const [expiryDays, setExpiryDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState(emptyProductForm());

  const [stockInFor, setStockInFor] = useState(null);
  const [stockInForm, setStockInForm] = useState(emptyStockIn());

  const [soldFor, setSoldFor] = useState(null);
  const [soldQty, setSoldQty] = useState("");
  const [soldDate, setSoldDate] = useState(todayISO());
  const [soldNote, setSoldNote] = useState("");

  const [adjustFor, setAdjustFor] = useState(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustDate, setAdjustDate] = useState(todayISO());
  const [adjustNote, setAdjustNote] = useState("");

  const [historyFor, setHistoryFor] = useState(null);
  const [movements, setMovements] = useState([]);
  const [batches, setBatches] = useState([]);

  const load = useCallback(async () => {
    const list = await inventoryApi.list(q);
    setProducts(Array.isArray(list) ? list : []);
  }, [q]);

  useEffect(() => {
    setLoading(true);
    setErr("");
    load()
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filtered = useMemo(
    () => filterInventoryProducts(products, { filter: listFilter, expiryDays: Number(expiryDays) || 30 }),
    [products, listFilter, expiryDays]
  );

  const totals = useMemo(() => {
    const costValue = products.reduce((s, p) => s + (Number(p.costValue) || 0), 0);
    const sellValue = products.reduce((s, p) => s + (Number(p.sellValue) || 0), 0);
    const lowCount = products.filter((p) => p.lowStock).length;
    const expiringCount = filterInventoryProducts(products, { filter: "expiring", expiryDays: Number(expiryDays) || 30 })
      .length;
    return { costValue, sellValue, lowCount, expiringCount, count: products.length };
  }, [products, expiryDays]);

  function clearPanels() {
    setStockInFor(null);
    setSoldFor(null);
    setAdjustFor(null);
    setHistoryFor(null);
  }

  async function createProduct(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await inventoryApi.create({
        name: newForm.name.trim(),
        unit: newForm.unit,
        sellPrice: Number(newForm.sellPrice) || 0,
        lowStockThreshold: Number(newForm.lowStockThreshold) || 0,
        note: newForm.note.trim(),
      });
      setNewForm(emptyProductForm());
      setShowNew(false);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitStockIn(e) {
    e.preventDefault();
    if (!stockInFor) return;
    setBusy(true);
    setErr("");
    try {
      const result = await inventoryApi.stockIn(stockInFor._id, {
        quantity: Number(stockInForm.quantity),
        unitCost: Number(stockInForm.unitCost) || 0,
        supplier: stockInForm.supplier.trim(),
        note: stockInForm.note.trim(),
        receivedAt: new Date(stockInForm.receivedAt).toISOString(),
        ...(stockInForm.expiryDate ? { expiryDate: new Date(stockInForm.expiryDate).toISOString() } : {}),
      });
      const product = result?.product || stockInFor;
      const batch = result?.batch;
      setStockInFor(null);
      setStockInForm(emptyStockIn());
      await load();
      if (batch && window.confirm("Stock saved. Print stock-in receipt?")) {
        printInventoryHtml(buildStockInReceiptHtml(product, batch, profile));
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitSold(e) {
    e.preventDefault();
    if (!soldFor) return;
    setBusy(true);
    setErr("");
    try {
      await inventoryApi.sold(soldFor._id, {
        quantity: Number(soldQty),
        date: new Date(soldDate).toISOString(),
        note: soldNote.trim() || "Closing / sold",
      });
      setSoldFor(null);
      setSoldQty("");
      setSoldNote("");
      setSoldDate(todayISO());
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitAdjust(e) {
    e.preventDefault();
    if (!adjustFor) return;
    setBusy(true);
    setErr("");
    try {
      await inventoryApi.adjust(adjustFor._id, {
        quantity: Number(adjustQty),
        date: new Date(adjustDate).toISOString(),
        note: adjustNote.trim() || "Adjustment (breakage / loss)",
      });
      setAdjustFor(null);
      setAdjustQty("");
      setAdjustNote("");
      setAdjustDate(todayISO());
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function openHistory(p) {
    clearPanels();
    setHistoryFor(p);
    setErr("");
    try {
      const [m, b] = await Promise.all([inventoryApi.movements(p._id), inventoryApi.batches(p._id)]);
      setMovements(Array.isArray(m) ? m : []);
      setBatches(Array.isArray(b) ? b : []);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function printStockCard(p) {
    setBusy(true);
    setErr("");
    try {
      const [m, b] = await Promise.all([inventoryApi.movements(p._id), inventoryApi.batches(p._id)]);
      printInventoryHtml(buildProductStockCardHtml(p, b, m, profile));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function printList(kind) {
    const days = Number(expiryDays) || 30;
    const list =
      kind === "closing"
        ? products
        : filterInventoryProducts(products, { filter: kind === "all" ? "all" : kind, expiryDays: days });
    printInventoryHtml(
      buildInventoryListHtml(list, profile, {
        kind: kind === "closing" ? "closing" : kind,
        expiryDays: days,
      })
    );
  }

  function exportCsv() {
    const days = Number(expiryDays) || 30;
    const list = filterInventoryProducts(products, {
      filter: listFilter === "all" ? "all" : listFilter,
      expiryDays: days,
    });
    const suffix = listFilter === "all" ? "all" : listFilter;
    downloadInventoryCsv(list, `inventory-${suffix}-${todayISO()}`);
  }

  async function removeProduct(p) {
    if (!isAdmin) return;
    const remaining = Number(p.quantityRemaining ?? p.onHand ?? 0);
    const stockNote =
      remaining > 0
        ? `\n\nThis product still has ${remaining.toLocaleString()} ${inventoryUnitLabel(p.unit)} in stock.`
        : "";
    if (
      !window.confirm(
        `Delete “${p.name}” permanently?\n\nThis removes the product, all batches, and stock history. This cannot be undone.${stockNote}`
      )
    ) {
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await inventoryApi.remove(p._id);
      if (historyFor?._id === p._id) {
        setHistoryFor(null);
        setMovements([]);
        setBatches([]);
      }
      if (stockInFor?._id === p._id) setStockInFor(null);
      if (soldFor?._id === p._id) setSoldFor(null);
      if (adjustFor?._id === p._id) setAdjustFor(null);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 style={{ margin: 0 }}>Inventory</h1>
        <button type="button" className="btn btn-primary" onClick={() => setShowNew((v) => !v)}>
          {showNew ? "Cancel" : "New product"}
        </button>
      </div>
      <p style={{ color: "var(--muted)", marginTop: "0.5rem", maxWidth: 640 }}>
        Add goods when they arrive. At closing, record sold quantities. Print lists, low-stock, expiry, and daily closing
        sheets as needed.
      </p>

      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      {!loading && products.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "0.75rem",
              marginBottom: "0.75rem",
            }}
          >
            <div>
              <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Products</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{totals.count}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Low stock</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: totals.lowCount ? "var(--danger)" : "inherit" }}>
                {totals.lowCount}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Expiring ≤ {expiryDays}d</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{totals.expiringCount}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Stock value (cost)</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{formatMoney(totals.costValue)}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Stock value (sell)</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{formatMoney(totals.sellValue)}</div>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <button type="button" className="btn btn-ghost" onClick={() => printList("all")}>
              Print all
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => printList("low")}>
              Print low stock
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => printList("expiring")}>
              Print expiring
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => printList("closing")}>
              Print closing sheet
            </button>
            <button type="button" className="btn btn-primary" onClick={exportCsv}>
              Download Excel/CSV
            </button>
            <label style={{ marginLeft: "0.5rem", fontSize: "0.85rem", color: "var(--muted)" }}>
              Expiry window (days)
              <input
                type="number"
                min="1"
                max="365"
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
                style={{ width: 64, marginLeft: 6 }}
              />
            </label>
          </div>
        </div>
      )}

      {showNew && (
        <form className="card" onSubmit={createProduct} style={{ marginBottom: "1rem" }}>
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>New product</h2>
          <div className="grid grid-2" style={{ gap: "0.75rem" }}>
            <div>
              <label>Name</label>
              <input
                value={newForm.name}
                onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                placeholder="e.g. Coca-Cola water"
                required
              />
            </div>
            <div>
              <label>Unit</label>
              <select value={newForm.unit} onChange={(e) => setNewForm({ ...newForm, unit: e.target.value })}>
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Sell price (optional)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newForm.sellPrice}
                onChange={(e) => setNewForm({ ...newForm, sellPrice: e.target.value })}
              />
            </div>
            <div>
              <label>Low stock alert at</label>
              <input
                type="number"
                min="0"
                step="1"
                value={newForm.lowStockThreshold}
                onChange={(e) => setNewForm({ ...newForm, lowStockThreshold: e.target.value })}
              />
            </div>
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            <label>Note</label>
            <input value={newForm.note} onChange={(e) => setNewForm({ ...newForm, note: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: "0.75rem" }} disabled={busy}>
            Save product
          </button>
        </form>
      )}

      <div className="card">
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            alignItems: "flex-end",
            marginBottom: "0.75rem",
          }}
        >
          <div style={{ flex: "1 1 200px", minWidth: 180 }}>
            <label htmlFor="inv-search">Search products</label>
            <input
              id="inv-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Product name…"
            />
          </div>
          <div style={{ flex: "0 1 160px" }}>
            <label htmlFor="inv-filter">Show</label>
            <select id="inv-filter" value={listFilter} onChange={(e) => setListFilter(e.target.value)}>
              <option value="all">All products</option>
              <option value="low">Low stock only</option>
              <option value="expiring">Expiring soon</option>
            </select>
          </div>
        </div>

        {!loading && filtered.length > 0 && (
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", color: "var(--muted)" }}>
            Showing {filtered.length} of {products.length} product{products.length === 1 ? "" : "s"}
          </p>
        )}

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading…</p>
        ) : products.length === 0 ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>No products yet. Click New product to start.</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>No products match this filter.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Unit</th>
                  <th>Remaining</th>
                  <th>Nearest expiry</th>
                  <th>Sell price</th>
                  <th>Cost value</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p._id}>
                    <td>
                      <strong>{p.name}</strong>
                      {p.lowStock && (
                        <span className="badge badge-danger" style={{ marginLeft: 6 }}>
                          low stock
                        </span>
                      )}
                    </td>
                    <td>{inventoryUnitLabel(p.unit)}</td>
                    <td>
                      <strong>{p.quantityRemaining ?? 0}</strong>
                    </td>
                    <td>{p.nearestExpiry ? toInputDate(p.nearestExpiry) : "—"}</td>
                    <td>{Number(p.sellPrice) > 0 ? formatMoney(p.sellPrice) : "—"}</td>
                    <td>{Number(p.costValue) > 0 ? formatMoney(p.costValue) : "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: "0.25rem 0.5rem", marginRight: 4 }}
                        onClick={() => {
                          clearPanels();
                          setStockInFor(p);
                          setStockInForm(emptyStockIn());
                        }}
                      >
                        Add stock
                      </button>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: "0.25rem 0.5rem", marginRight: 4 }}
                        onClick={() => {
                          clearPanels();
                          setSoldFor(p);
                          setSoldQty("");
                          setSoldDate(todayISO());
                          setSoldNote("");
                        }}
                      >
                        Record sold
                      </button>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: "0.25rem 0.5rem", marginRight: 4 }}
                        onClick={() => {
                          clearPanels();
                          setAdjustFor(p);
                          setAdjustQty("");
                          setAdjustDate(todayISO());
                          setAdjustNote("");
                        }}
                      >
                        Adjust
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: "0.25rem 0.5rem", marginRight: 4 }}
                        onClick={() => openHistory(p)}
                      >
                        History
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: "0.25rem 0.5rem", marginRight: 4 }}
                        disabled={busy}
                        onClick={() => printStockCard(p)}
                      >
                        Print card
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: "0.25rem 0.5rem", color: "var(--danger, #b91c1c)" }}
                          onClick={() => removeProduct(p)}
                          disabled={busy}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {stockInFor && (
        <form className="card" onSubmit={submitStockIn} style={{ marginTop: "1rem" }}>
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>
            Add stock — {stockInFor.name} ({inventoryUnitLabel(stockInFor.unit)})
          </h2>
          <div className="grid grid-2" style={{ gap: "0.75rem" }}>
            <div>
              <label>Quantity received</label>
              <input
                type="number"
                min="0.001"
                step="any"
                value={stockInForm.quantity}
                onChange={(e) => setStockInForm({ ...stockInForm, quantity: e.target.value })}
                required
              />
            </div>
            <div>
              <label>Unit cost (optional)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={stockInForm.unitCost}
                onChange={(e) => setStockInForm({ ...stockInForm, unitCost: e.target.value })}
              />
            </div>
            <div>
              <label>Supplier (optional)</label>
              <input
                value={stockInForm.supplier}
                onChange={(e) => setStockInForm({ ...stockInForm, supplier: e.target.value })}
                placeholder="Company that sent the goods"
              />
            </div>
            <div>
              <label>Received date</label>
              <input
                type="date"
                value={stockInForm.receivedAt}
                onChange={(e) => setStockInForm({ ...stockInForm, receivedAt: e.target.value })}
                required
              />
            </div>
            <div>
              <label>Expiry date (this delivery)</label>
              <input
                type="date"
                value={stockInForm.expiryDate}
                onChange={(e) => setStockInForm({ ...stockInForm, expiryDate: e.target.value })}
              />
            </div>
            <div>
              <label>Note</label>
              <input
                value={stockInForm.note}
                onChange={(e) => setStockInForm({ ...stockInForm, note: e.target.value })}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Save stock in
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setStockInFor(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {soldFor && (
        <form className="card" onSubmit={submitSold} style={{ marginTop: "1rem" }}>
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>
            Record sold (closing) — {soldFor.name}
          </h2>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 0 }}>
            Remaining now: <strong>{soldFor.quantityRemaining ?? 0}</strong> {inventoryUnitLabel(soldFor.unit)}.
          </p>
          <div className="grid grid-2" style={{ gap: "0.75rem" }}>
            <div>
              <label>Quantity sold</label>
              <input
                type="number"
                min="0.001"
                step="any"
                value={soldQty}
                onChange={(e) => setSoldQty(e.target.value)}
                required
              />
            </div>
            <div>
              <label>Date</label>
              <input type="date" value={soldDate} onChange={(e) => setSoldDate(e.target.value)} required />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label>Note</label>
              <input value={soldNote} onChange={(e) => setSoldNote(e.target.value)} placeholder="Closing count" />
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Save sold
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setSoldFor(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {adjustFor && (
        <form className="card" onSubmit={submitAdjust} style={{ marginTop: "1rem" }}>
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>
            Adjust stock (breakage / loss) — {adjustFor.name}
          </h2>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 0 }}>
            Remaining now: <strong>{adjustFor.quantityRemaining ?? 0}</strong> {inventoryUnitLabel(adjustFor.unit)}. This
            removes stock without recording a sale.
          </p>
          <div className="grid grid-2" style={{ gap: "0.75rem" }}>
            <div>
              <label>Quantity to remove</label>
              <input
                type="number"
                min="0.001"
                step="any"
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                required
              />
            </div>
            <div>
              <label>Date</label>
              <input type="date" value={adjustDate} onChange={(e) => setAdjustDate(e.target.value)} required />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label>Reason</label>
              <input
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="Breakage, spoilage, theft…"
                required
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Save adjustment
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAdjustFor(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {historyFor && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>History — {historyFor.name}</h2>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => printStockCard(historyFor)}>
                Print stock card
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setHistoryFor(null)}>
                Close
              </button>
            </div>
          </div>

          <h3 style={{ fontSize: "0.95rem", marginBottom: "0.35rem" }}>Open batches (remaining)</h3>
          {batches.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>No stock left in batches.</p>
          ) : (
            <div className="table-wrap" style={{ marginBottom: "1rem" }}>
              <table>
                <thead>
                  <tr>
                    <th>Received</th>
                    <th>Remaining</th>
                    <th>Of</th>
                    <th>Expiry</th>
                    <th>Supplier</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b._id}>
                      <td>{toInputDate(b.receivedAt)}</td>
                      <td>{b.quantityRemaining}</td>
                      <td>{b.quantityReceived}</td>
                      <td>{b.expiryDate ? toInputDate(b.expiryDate) : "—"}</td>
                      <td>{b.supplier || "—"}</td>
                      <td>{Number(b.unitCost) > 0 ? formatMoney(b.unitCost) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 style={{ fontSize: "0.95rem", marginBottom: "0.35rem" }}>Movements</h3>
          {movements.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>No movements yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Qty</th>
                    <th>Supplier</th>
                    <th>Note</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m._id}>
                      <td>{toInputDate(m.date)}</td>
                      <td>{m.type}</td>
                      <td>{m.quantity}</td>
                      <td>{m.supplier || "—"}</td>
                      <td>{m.note || "—"}</td>
                      <td>{m.createdBy || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
