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
    <div className="loginWrap">
      <div className="loginCard">
        <div className="loginBrandRow">
          <div className="loginLogo" aria-hidden>
            S
          </div>
          <div>
            <h1 className="loginTitle">Samakaab Supermarket</h1>
            <p className="loginSubtitle">Sign in to manage credit</p>
          </div>
        </div>

        <form onSubmit={onSubmit}>
          <div className="loginField">
            <label htmlFor="u">Username</label>
            <input
              id="u"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
            />
          </div>
          <div className="loginField">
            <label htmlFor="p">Password</label>
            <input
              id="p"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>

          <div className="loginActions">
            {err && <p style={{ color: "var(--danger)", margin: 0, fontSize: "0.9rem" }}>{err}</p>}
            <button type="submit" className="btn btn-primary btn-login" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>

        <p className="loginHint">Session expires when the browser is closed.</p>
      </div>
    </div>
  );
}
