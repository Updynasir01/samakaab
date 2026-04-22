import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export default function Login() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setPending(true);
    try {
      await login(username, password);
    } catch (x) {
      setErr(x.message || "Login failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "linear-gradient(165deg, #f0f7f4 0%, #e8f0f8 45%, #f5f0fa 100%)",
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 380 }}>
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.35rem" }}>Samakaab Supermarket</h1>
        <p style={{ margin: "0 0 1.25rem", color: "var(--muted)", fontSize: "0.95rem" }}>Sign in to manage credit</p>
        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: "0.75rem" }}>
            <label htmlFor="u">Username</label>
            <input id="u" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label htmlFor="p">Password</label>
            <input
              id="p"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {err && (
            <p style={{ color: "var(--danger)", margin: "0 0 0.75rem", fontSize: "0.9rem" }}>{err}</p>
          )}
          <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
