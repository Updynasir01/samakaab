import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth.jsx";

const navStyle = ({ isActive }) => ({
  color: isActive ? "var(--text)" : "var(--muted)",
  fontWeight: isActive ? 600 : 400,
  padding: "0.5rem 0",
  borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
});

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();

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
          <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>
            Samakaab <span style={{ color: "var(--muted)", fontWeight: 500 }}>Credit</span>
          </div>
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
      <main style={{ flex: 1, maxWidth: 1100, width: "100%", margin: "0 auto", padding: "1.25rem 1rem 2rem" }}>
        <Outlet />
      </main>
      <footer style={{ padding: "1rem", textAlign: "center", color: "var(--muted)", fontSize: "0.85rem" }}>
        Samakaab Supermarket — customer credit management
      </footer>
    </div>
  );
}
