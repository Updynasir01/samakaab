import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { useCompanyProfile } from "../companySettings.jsx";
import { pingApiHealth } from "../api.js";

const navStyle = ({ isActive }) => ({
  color: isActive ? "var(--text)" : "var(--muted)",
  fontWeight: isActive ? 600 : 400,
  padding: "0.5rem 0",
  borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
});

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const { profile } = useCompanyProfile();
  const [connMsg, setConnMsg] = useState("");
  const hiddenAt = useRef(null);

  useEffect(() => {
    document.title = profile.systemTitle || "Samakaab";
  }, [profile.systemTitle]);

  useEffect(() => {
    if (!user) return;

    const onVisibility = async () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const awayMs = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      if (awayMs < 45_000) return;
      setConnMsg("Reconnecting to server…");
      const ok = await pingApiHealth();
      setConnMsg(ok ? "" : "Server is waking up — wait ~30 seconds, then click once (do not click many times).");
    };

    document.addEventListener("visibilitychange", onVisibility);

    const keepAlive = setInterval(() => {
      if (document.visibilityState === "visible") pingApiHealth(15_000);
    }, 4 * 60 * 1000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(keepAlive);
    };
  }, [user]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          boxShadow: "var(--shadow-md)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "0.75rem 1rem",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "1rem",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{profile.brandName}</div>
          <nav style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
            <NavLink to="/" style={navStyle} end>
              Dashboard
            </NavLink>
            <NavLink to="/customers" style={navStyle}>
              Customers
            </NavLink>
            <NavLink to="/invoices" style={navStyle}>
              Invoices
            </NavLink>
            <NavLink to="/invoices/open" style={navStyle}>
              Open invoices
            </NavLink>
            <NavLink to="/inventory" style={navStyle}>
              Inventory
            </NavLink>
            <NavLink to="/reports" style={navStyle}>
              Reports
            </NavLink>
            {isAdmin && (
              <NavLink to="/settings" style={navStyle}>
                Settings
              </NavLink>
            )}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.9rem" }}>
            <span style={{ color: "var(--muted)" }}>
              {user?.username}{" "}
              <span style={{ color: "var(--accent)" }}>({user?.role})</span>
            </span>
            <button type="button" className="btn btn-ghost" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
      </header>
      {connMsg && (
        <div
          style={{
            background: "#fff8e6",
            borderBottom: "1px solid #f0d78c",
            color: "#7a5d00",
            textAlign: "center",
            padding: "0.5rem 1rem",
            fontSize: "0.9rem",
          }}
        >
          {connMsg}
        </div>
      )}
      <main style={{ flex: 1, maxWidth: 1100, width: "100%", margin: "0 auto", padding: "1.25rem 1rem 2rem" }}>
        <Outlet />
      </main>
      <footer style={{ padding: "1rem", textAlign: "center", color: "var(--muted)", fontSize: "0.85rem" }}>
        {profile.legalName} — customer credit management
      </footer>
    </div>
  );
}
