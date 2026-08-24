import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { accountApi } from "../api.js";
import { useAuth } from "../auth.jsx";
import { formatMoney } from "../util.js";

export default function Account() {
  const { isAdmin } = useAuth();
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    setErr("");
    return accountApi
      .people(q)
      .then((rows) => setList(Array.isArray(rows) ? rows : []))
      .catch((e) => setErr(e.message));
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [q]);

  async function createPerson(e) {
    e.preventDefault();
    if (!name.trim()) {
      setErr("Name is required.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await accountApi.createPerson({ name: name.trim(), phone: phone.trim(), note: note.trim() });
      setName("");
      setPhone("");
      setNote("");
      setShowNew(false);
      await load();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }

  async function removePerson(p) {
    if (!isAdmin || p.unassigned) return;
    if (!window.confirm(`Delete account for “${p.name}”? Only empty accounts can be deleted.`)) return;
    setBusy(true);
    setErr("");
    try {
      await accountApi.removePerson(p._id);
      await load();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ margin: 0 }}>Account</h1>
          <p style={{ color: "var(--muted)", margin: "0.35rem 0 0", maxWidth: 560 }}>
            Each person has their own ledger. Open a name, then <strong>Record</strong> (credit) or{" "}
            <strong>Remove</strong> (debit) like a payment on an invoice.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowNew((v) => !v)}>
          {showNew ? "Cancel" : "New person"}
        </button>
      </div>

      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      {showNew && (
        <form className="card" onSubmit={createPerson} style={{ marginTop: "1rem" }}>
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>New person</h2>
          <div className="grid grid-2" style={{ gap: "0.75rem" }}>
            <div>
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Amey" />
            </div>
            <div>
              <label>Phone (optional)</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label>Note (optional)</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: "0.75rem" }} disabled={busy}>
            Save person
          </button>
        </form>
      )}

      <div className="card" style={{ marginTop: "1rem" }}>
        <div style={{ marginBottom: "0.75rem" }}>
          <label htmlFor="acc-search">Search</label>
          <input
            id="acc-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name or phone…"
          />
        </div>
        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading…</p>
        ) : list.length === 0 ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>No people yet. Click New person to start.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th style={{ textAlign: "right" }}>Debit</th>
                  <th style={{ textAlign: "right" }}>Credit</th>
                  <th style={{ textAlign: "right" }}>Balance</th>
                  {isAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p._id}>
                    <td>
                      <Link to={`/account/${p._id}`}>{p.name}</Link>
                    </td>
                    <td>{p.phone || "—"}</td>
                    <td style={{ textAlign: "right" }}>{formatMoney(p.debit)}</td>
                    <td style={{ textAlign: "right" }}>{formatMoney(p.credit)}</td>
                    <td style={{ textAlign: "right" }}>
                      <strong>{formatMoney(p.balance)}</strong>
                    </td>
                    {isAdmin && (
                      <td>
                        {!p.unassigned && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: "0.2rem 0.45rem", color: "var(--danger)" }}
                            disabled={busy}
                            onClick={() => removePerson(p)}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
