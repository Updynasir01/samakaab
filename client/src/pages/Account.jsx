import { useCallback, useEffect, useState } from "react";
import { accountApi } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useCompanyProfile } from "../companySettings.jsx";
import { formatMoney, todayISO } from "../util.js";

function nowTimeLocal() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function combineDateTime(dateStr, timeStr) {
  const raw = timeStr && timeStr.length >= 5 ? timeStr : "00:00";
  const t = raw.length <= 5 ? `${raw}:00` : raw.slice(0, 8);
  return new Date(`${dateStr}T${t}`);
}

function formatStamp(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return "—";
  return x.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function AccountModal({ open, onClose, children }) {
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
      <div className="modal-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export default function Account() {
  const { isAdmin } = useAuth();
  const { profile } = useCompanyProfile();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState({ previousBalance: 0, entries: [], totals: { debit: 0, credit: 0, balance: 0 } });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [mode, setMode] = useState(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState(nowTimeLocal());
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    const list = await accountApi.list(from, to);
    setData({
      previousBalance: Number(list?.previousBalance) || 0,
      entries: Array.isArray(list?.entries) ? list.entries : [],
      totals: list?.totals || { debit: 0, credit: 0, balance: 0 },
    });
  }, [from, to]);

  useEffect(() => {
    setLoading(true);
    setErr("");
    load()
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [load]);

  function openForm(nextMode) {
    setMode(nextMode);
    setAmount("");
    setDate(todayISO());
    setTime(nowTimeLocal());
    setDescription("");
    setErr("");
  }

  async function submitEntry(e) {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr("Enter an amount greater than 0.");
      return;
    }
    const when = combineDateTime(date, time);
    if (Number.isNaN(when.getTime())) {
      setErr("Enter a valid date and time.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await accountApi.create({
        type: mode === "remove" ? "debit" : "credit",
        amount: amt,
        date: when.toISOString(),
        description: description.trim(),
      });
      setMode(null);
      await load();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(row) {
    if (!isAdmin || !window.confirm(`Delete transaction #${row.transNo}? This cannot be undone.`)) return;
    setBusy(true);
    setErr("");
    try {
      await accountApi.remove(row._id);
      await load();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }

  function printSheet() {
    window.print();
  }

  const rows = data.entries;
  const showPrev = from && (Number(data.previousBalance) !== 0 || rows.length > 0);

  return (
    <div>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ margin: 0 }}>Account</h1>
          <p style={{ color: "var(--muted)", margin: "0.35rem 0 0", maxWidth: 560 }}>
            Money held outside the shop. <strong>Record</strong> adds to the balance. <strong>Remove</strong> takes money out.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" onClick={() => openForm("record")}>
            Record money
          </button>
          <button type="button" className="btn" onClick={() => openForm("remove")}>
            Remove money
          </button>
          <button type="button" className="btn btn-ghost" onClick={printSheet}>
            Print
          </button>
        </div>
      </div>

      {err && !mode && <p className="no-print" style={{ color: "var(--danger)" }}>{err}</p>}

      <div className="card" style={{ marginTop: "1rem" }}>
        <div className="account-letterhead" style={{ marginBottom: "1rem" }}>
          <h2 style={{ margin: "0 0 0.35rem", textAlign: "center", fontSize: "1.15rem" }}>Account Activity</h2>
          <p style={{ margin: 0, textAlign: "center", color: "var(--muted)", fontSize: "0.9rem" }}>
            {profile.legalName || profile.brandName}
          </p>
          <p style={{ margin: "0.15rem 0 0", textAlign: "center", color: "var(--muted)", fontSize: "0.85rem" }}>
            Printed {new Date().toLocaleString()}
            {from || to ? ` · ${from || "…"} to ${to || "…"}` : " · All dates"}
          </p>
        </div>

        <div
          className="no-print"
          style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end", marginBottom: "0.85rem" }}
        >
          <div>
            <label htmlFor="acc-from">From</label>
            <input id="acc-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label htmlFor="acc-to">To</label>
            <input id="acc-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => { setFrom(""); setTo(""); }}>
            All dates
          </button>
        </div>

        <div
          className="no-print"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "0.75rem",
            marginBottom: "0.85rem",
          }}
        >
          <div>
            <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Debit (removed)</div>
            <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>{formatMoney(data.totals.debit)}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Credit (recorded)</div>
            <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>{formatMoney(data.totals.credit)}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Balance</div>
            <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>{formatMoney(data.totals.balance)}</div>
          </div>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading…</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date / time</th>
                  <th>Trans No</th>
                  <th>Description</th>
                  <th style={{ textAlign: "right" }}>Debit</th>
                  <th style={{ textAlign: "right" }}>Credit</th>
                  <th style={{ textAlign: "right" }}>Balance</th>
                  {isAdmin && <th className="no-print" />}
                </tr>
              </thead>
              <tbody>
                {showPrev && (
                  <tr>
                    <td>{from}</td>
                    <td>—</td>
                    <td>Previous balance</td>
                    <td style={{ textAlign: "right" }}>—</td>
                    <td style={{ textAlign: "right" }}>—</td>
                    <td style={{ textAlign: "right" }}>{formatMoney(data.previousBalance)}</td>
                    {isAdmin && <td className="no-print" />}
                  </tr>
                )}
                {rows.length === 0 && !showPrev ? (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 6} style={{ color: "var(--muted)" }}>
                      No entries yet. Use Record money or Remove money.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r._id}>
                      <td>{formatStamp(r.date)}</td>
                      <td>{r.transNo}</td>
                      <td>{r.description || "—"}</td>
                      <td style={{ textAlign: "right" }}>{r.debit > 0 ? formatMoney(r.debit) : ""}</td>
                      <td style={{ textAlign: "right" }}>{r.credit > 0 ? formatMoney(r.credit) : ""}</td>
                      <td style={{ textAlign: "right" }}>{formatMoney(r.balance)}</td>
                      {isAdmin && (
                        <td className="no-print" style={{ whiteSpace: "nowrap" }}>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: "0.2rem 0.45rem", color: "var(--danger)" }}
                            disabled={busy}
                            onClick={() => removeEntry(r)}
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ fontWeight: 700 }}>
                      Total
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(data.totals.debit)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(data.totals.credit)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(data.totals.balance)}</td>
                    {isAdmin && <td className="no-print" />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {mode && (
        <AccountModal open onClose={() => !busy && setMode(null)}>
          <form onSubmit={submitEntry}>
            <h2 style={{ fontSize: "1.05rem" }}>{mode === "remove" ? "Remove money" : "Record money"}</h2>
            {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
            <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 0 }}>
              {mode === "remove"
                ? "Takes money out of this account (debit). Balance goes down."
                : "Adds money into this account (credit). Balance goes up."}
            </p>
            <div className="grid grid-2" style={{ gap: "0.75rem" }}>
              <div>
                <label>Amount</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label>Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div>
                <label>Time</label>
                <input type="time" step="1" value={time} onChange={(e) => setTime(e.target.value)} required />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label>Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={mode === "remove" ? "Why money was taken out" : "Where this money came from"}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Save
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => !busy && setMode(null)}>
                Cancel
              </button>
            </div>
          </form>
        </AccountModal>
      )}
    </div>
  );
}
