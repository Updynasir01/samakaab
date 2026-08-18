import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { inventoryApi } from "../api.js";
import { useCompanyProfile } from "../companySettings.jsx";
import { formatMoney, todayISO, toInputDate } from "../util.js";
import {
  buildInventoryListHtml,
  buildProductStockCardHtml,
  buildStockInReceiptHtml,
  downloadInventoryCsv,
  filterInventoryProducts,
  inventoryUnitLabel,
  INVENTORY_STORES,
  printInventoryHtml,
} from "../inventoryExport.js";

const UNITS = [
  { value: "bottle", label: "Bottle" },
  { value: "box", label: "Box" },
  { value: "kg", label: "Kg" },
  { value: "piece", label: "Piece" },
];

function emptyProductForm() {
  return { name: "", unit: "bottle", sellPrice: "", lowStockThreshold: "10", note: "", store: "" };
}

function emptyStockIn() {
  return {
    quantity: "",
    unitCost: "",
    expiryDate: "",
    store: "",
    receivedAt: todayISO(),
    note: "",
  };
}

function InventoryModal({ open, onClose, wide, children }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className={`modal-panel${wide ? " modal-panel-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export default function Inventory() {
  const { profile } = useCompanyProfile();
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [listFilter, setListFilter] = useState("all");
  const [storeFilter, setStoreFilter] = useState("");
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
  const [adjustName, setAdjustName] = useState("");
  const [adjustStore, setAdjustStore] = useState("");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustDate, setAdjustDate] = useState(todayISO());
  const [adjustNote, setAdjustNote] = useState("");

  const [historyFor, setHistoryFor] = useState(null);
  const [movements, setMovements] = useState([]);
  const [batches, setBatches] = useState([]);
  const [printOpen, setPrintOpen] = useState(false);
  const printMenuRef = useRef(null);
  const [deleteFor, setDeleteFor] = useState(null);
  const [manageId, setManageId] = useState(null);
  const manageMenuRef = useRef(null);

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

  useEffect(() => {
    if (!printOpen && !manageId) return;
    function onDoc(e) {
      if (printOpen && !printMenuRef.current?.contains(e.target)) setPrintOpen(false);
      if (manageId && !manageMenuRef.current?.contains(e.target)) setManageId(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [printOpen, manageId]);

  const filtered = useMemo(
    () =>
      filterInventoryProducts(products, {
        filter: listFilter,
        expiryDays: Number(expiryDays) || 30,
        store: storeFilter,
      }),
    [products, listFilter, expiryDays, storeFilter]
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
    setDeleteFor(null);
  }

  async function createProduct(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await inventoryApi.create({
        name: newForm.name.trim(),
        unit: newForm.unit,
        store: newForm.store,
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
        store: stockInForm.store,
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
    const name = adjustName.trim();
    if (!name) {
      setErr("Product name is required.");
      return;
    }
    const qty = Number(adjustQty);
    const hasAdjust = Number.isFinite(qty) && qty > 0;
    if (hasAdjust && !adjustNote.trim()) {
      setErr("Enter a reason to remove stock.");
      return;
    }
    const storeChanged = adjustStore && adjustStore !== (adjustFor.store || "");
    if (!hasAdjust && name === adjustFor.name && !storeChanged) {
      setErr("Change the name or store, or enter a quantity to remove.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const productPatch = {};
      if (name !== adjustFor.name) productPatch.name = name;
      if (storeChanged) productPatch.store = adjustStore;
      if (Object.keys(productPatch).length) {
        await inventoryApi.update(adjustFor._id, productPatch);
        if (historyFor?._id === adjustFor._id) {
          setHistoryFor({ ...historyFor, ...productPatch });
        }
      }
      if (hasAdjust) {
        await inventoryApi.adjust(adjustFor._id, {
          quantity: qty,
          date: new Date(adjustDate).toISOString(),
          note: adjustNote.trim() || "Adjustment (breakage / loss)",
        });
      }
      setAdjustFor(null);
      setAdjustName("");
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
        : filterInventoryProducts(products, {
            filter: kind === "all" ? "all" : kind,
            expiryDays: days,
            store: storeFilter,
          });
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
      store: storeFilter,
    });
    const suffix = listFilter === "all" ? "all" : listFilter;
    downloadInventoryCsv(list, `inventory-${suffix}-${todayISO()}`);
  }

  async function confirmDeleteProduct() {
    const p = deleteFor;
    if (!p) return;
    setBusy(true);
    setErr("");
    try {
      await inventoryApi.remove(p._id);
      setDeleteFor(null);
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
            <div className="dropdown" ref={printMenuRef}>
              <button type="button" className="btn" onClick={() => setPrintOpen((v) => !v)}>
                Print ▾
              </button>
              {printOpen && (
                <div className="dropdown-menu">
                  <button
                    type="button"
                    onClick={() => {
                      setPrintOpen(false);
                      printList("all");
                    }}
                  >
                    Print all
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPrintOpen(false);
                      printList("low");
                    }}
                  >
                    Print low stock
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPrintOpen(false);
                      printList("expiring");
                    }}
                  >
                    Print expiring
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPrintOpen(false);
                      printList("closing");
                    }}
                  >
                    Print closing sheet
                  </button>
                </div>
              )}
            </div>
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
              <label>Store</label>
              <select
                value={newForm.store}
                onChange={(e) => setNewForm({ ...newForm, store: e.target.value })}
                required
              >
                <option value="">Select store</option>
                {INVENTORY_STORES.map((s) => (
                  <option key={s} value={s}>
                    {s}
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
          <div style={{ flex: "0 1 160px" }}>
            <label htmlFor="inv-store">Store</label>
            <select id="inv-store" value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
              <option value="">All stores</option>
              {INVENTORY_STORES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
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
          <div className={`table-wrap${manageId ? " menu-open" : ""}`}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item name</th>
                  <th>Store</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Cost</th>
                  <th>Sale price</th>
                  <th>Total</th>
                  <th>EXP</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const qty = Number(p.quantityRemaining ?? 0);
                  const costValue = Number(p.costValue) || 0;
                  const avgCost = qty > 0 && costValue > 0 ? costValue / qty : 0;
                  const sellPrice = Number(p.sellPrice) || 0;
                  const sellValue = Number(p.sellValue) || qty * sellPrice;
                  return (
                  <tr key={p._id}>
                    <td>{i + 1}</td>
                    <td>
                      <strong>{p.name}</strong>
                      {p.lowStock && (
                        <span className="badge badge-danger" style={{ marginLeft: 6 }}>
                          low stock
                        </span>
                      )}
                    </td>
                    <td>{p.store || "—"}</td>
                    <td>
                      <strong>{qty}</strong>
                    </td>
                    <td>{inventoryUnitLabel(p.unit)}</td>
                    <td>{avgCost > 0 ? formatMoney(avgCost) : "—"}</td>
                    <td>{sellPrice > 0 ? formatMoney(sellPrice) : "—"}</td>
                    <td>{sellValue > 0 ? formatMoney(sellValue) : "—"}</td>
                    <td>{p.nearestExpiry ? toInputDate(p.nearestExpiry) : "—"}</td>
                    <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                      <div
                        className="dropdown"
                        ref={manageId === p._id ? manageMenuRef : null}
                      >
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: "0.25rem 0.65rem" }}
                          onClick={() => {
                            setPrintOpen(false);
                            setManageId((id) => (id === p._id ? null : p._id));
                          }}
                        >
                          Manage ▾
                        </button>
                        {manageId === p._id && (
                          <div className="dropdown-menu dropdown-menu-end">
                            <button
                              type="button"
                              onClick={() => {
                                setManageId(null);
                                clearPanels();
                                setStockInFor(p);
                                setStockInForm({ ...emptyStockIn(), store: p.store || "" });
                              }}
                            >
                              Add stock
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setManageId(null);
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
                              onClick={() => {
                                setManageId(null);
                                clearPanels();
                                setAdjustFor(p);
                                setAdjustName(p.name || "");
                          setAdjustStore(p.store || "");
                                setAdjustQty("");
                                setAdjustDate(todayISO());
                                setAdjustNote("");
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setManageId(null);
                                openHistory(p);
                              }}
                            >
                              History
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setManageId(null);
                                printStockCard(p);
                              }}
                            >
                              Print card
                            </button>
                            <button
                              type="button"
                              className="danger"
                              disabled={busy}
                              onClick={() => {
                                setManageId(null);
                                clearPanels();
                                setDeleteFor(p);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {stockInFor && (
        <InventoryModal open onClose={() => !busy && setStockInFor(null)}>
          <form onSubmit={submitStockIn}>
            <h2 style={{ fontSize: "1.05rem" }}>
              Add stock — {stockInFor.name} ({inventoryUnitLabel(stockInFor.unit)})
            </h2>
            {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
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
                <label>Store</label>
                <select
                  value={stockInForm.store}
                  onChange={(e) => setStockInForm({ ...stockInForm, store: e.target.value })}
                  required
                >
                  <option value="">Select store</option>
                  {INVENTORY_STORES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
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
              <button type="button" className="btn btn-ghost" onClick={() => !busy && setStockInFor(null)}>
                Cancel
              </button>
            </div>
          </form>
        </InventoryModal>
      )}

      {soldFor && (
        <InventoryModal open onClose={() => !busy && setSoldFor(null)}>
          <form onSubmit={submitSold}>
            <h2 style={{ fontSize: "1.05rem" }}>Record sold (closing) — {soldFor.name}</h2>
            {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
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
              <button type="button" className="btn btn-ghost" onClick={() => !busy && setSoldFor(null)}>
                Cancel
              </button>
            </div>
          </form>
        </InventoryModal>
      )}

      {adjustFor && (
        <InventoryModal open onClose={() => !busy && setAdjustFor(null)}>
          <form onSubmit={submitAdjust}>
            <h2 style={{ fontSize: "1.05rem" }}>Edit — {adjustFor.name}</h2>
            {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
            <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 0 }}>
              Remaining now: <strong>{adjustFor.quantityRemaining ?? 0}</strong> {inventoryUnitLabel(adjustFor.unit)}. You
              can rename the product. Quantity is only needed if you are removing stock (breakage / loss), not a sale.
            </p>
            <div className="grid grid-2" style={{ gap: "0.75rem" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label>Item name</label>
                <input value={adjustName} onChange={(e) => setAdjustName(e.target.value)} required />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label>Store</label>
                <select value={adjustStore} onChange={(e) => setAdjustStore(e.target.value)} required>
                  <option value="">Select store</option>
                  {INVENTORY_STORES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Quantity to remove (optional)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  placeholder="Leave blank to only rename"
                />
              </div>
              <div>
                <label>Date</label>
                <input type="date" value={adjustDate} onChange={(e) => setAdjustDate(e.target.value)} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label>Reason (if removing stock)</label>
                <input
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  placeholder="Breakage, spoilage, theft…"
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Save
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => !busy && setAdjustFor(null)}>
                Cancel
              </button>
            </div>
          </form>
        </InventoryModal>
      )}

      {historyFor && (
        <InventoryModal wide open onClose={() => setHistoryFor(null)}>
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
          {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

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
                    <th>Store</th>
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
                    <th>Store</th>
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
        </InventoryModal>
      )}

      {deleteFor && (
        <InventoryModal open onClose={() => !busy && setDeleteFor(null)}>
          <h2 style={{ fontSize: "1.05rem" }}>Delete product?</h2>
          <p style={{ marginTop: 0 }}>
            Delete <strong>{deleteFor.name}</strong> permanently?
          </p>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            This removes the product, all batches, and stock history. This cannot be undone.
            {Number(deleteFor.quantityRemaining ?? deleteFor.onHand ?? 0) > 0
              ? ` It still has ${Number(deleteFor.quantityRemaining ?? 0).toLocaleString()} ${inventoryUnitLabel(deleteFor.unit)} in stock.`
              : ""}
          </p>
          {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <button type="button" className="btn btn-danger" disabled={busy} onClick={confirmDeleteProduct}>
              Yes, delete
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setDeleteFor(null)}>
              Cancel
            </button>
          </div>
        </InventoryModal>
      )}
    </div>
  );
}
