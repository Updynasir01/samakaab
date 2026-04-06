import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { customersApi, creditsApi } from "../api.js";
import { formatMoney } from "../util.js";

export default function Customers() {
  const [searchParams] = useSearchParams();
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [hasDebt, setHasDebt] = useState(() => searchParams.get("hasDebt") === "true");
  const [itemQ, setItemQ] = useState("");
  const [creditHits, setCreditHits] = useState(null);
  const [err, setErr] = useState("");

  function load() {
    const params = {};
    if (q.trim()) params.q = q.trim();
    if (hasDebt) params.hasDebt = "true";
    return customersApi
      .list(params)
      .then(setList)
      .catch((e) => setErr(e.message));
  }

  useEffect(() => {
    setHasDebt(searchParams.get("hasDebt") === "true");
  }, [searchParams]);

  useEffect(() => {
    setErr("");
    load();
  }, [q, hasDebt]);

  async function searchItems() {
    if (!itemQ.trim()) {
      setCreditHits(null);
      return;
    }
    try {
      const hits = await creditsApi.search(itemQ.trim());
      setCreditHits(hits);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Customers</h1>
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div className="grid grid-2" style={{ alignItems: "end" }}>
          <div>
            <label htmlFor="search">Search name / phone / notes</label>
            <input id="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to filter…" />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
            <input type="checkbox" checked={hasDebt} onChange={(e) => setHasDebt(e.target.checked)} />
            Only customers with debt
          </label>
        </div>
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label htmlFor="item">Search items (credit description)</label>
            <input id="item" value={itemQ} onChange={(e) => setItemQ(e.target.value)} placeholder="e.g. milk, bread" />
          </div>
          <button type="button" className="btn btn-primary" onClick={searchItems}>
            Search credits
          </button>
        </div>
      </div>

      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      {creditHits && creditHits.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Matching credit lines</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {creditHits.map((c) => (
                  <tr key={c._id}>
                    <td>
                      <Link to={`/customers/${c.customer._id}`}>{c.customer.fullName}</Link>
                    </td>
                    <td>{c.description}</td>
                    <td>{formatMoney(c.amount)}</td>
                    <td>{new Date(c.dateOfCredit).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>All customers</h2>
          <Link to="/customers/new" className="btn btn-primary">
            Add customer
          </Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c._id}>
                  <td>
                    <Link to={`/customers/${c._id}`}>{c.fullName}</Link>
                  </td>
                  <td>{c.phone}</td>
                  <td>{c.balance > 0 ? <strong>{formatMoney(c.balance)}</strong> : formatMoney(c.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ margin: "0.75rem 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
          Balance = total credit − total payments.
        </p>
      </div>
    </div>
  );
}
