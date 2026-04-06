import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { authApi } from "../api.js";

export default function Settings() {
  const { isAdmin } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("staff");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, setPending] = useState(false);

  if (!isAdmin) return <Navigate to="/" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setPending(true);
    try {
      await authApi.register({ username, password, role });
      setMsg(`User ${username} created.`);
      setUsername("");
      setPassword("");
      setRole("staff");
    } catch (x) {
      setErr(x.message || "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Settings</h1>
      <div className="card" style={{ maxWidth: 420 }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Create staff or admin account</h2>
        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: "0.75rem" }}>
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
          </div>
          <div style={{ marginBottom: "0.75rem" }}>
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <div style={{ marginBottom: "0.75rem" }}>
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="staff">Staff (cannot delete)</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
          {msg && <p style={{ color: "var(--accent)" }}>{msg}</p>}
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Creating…" : "Create user"}
          </button>
        </form>
      </div>
    </div>
  );
}
