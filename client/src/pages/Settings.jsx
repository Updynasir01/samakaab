import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { useCompanyProfile } from "../companySettings.jsx";
import { authApi, settingsApi, backupApi } from "../api.js";
import { mergeCompanyProfile } from "../companyProfile.js";
import { downloadBlob } from "../util.js";

function formFromProfile(p) {
  const x = mergeCompanyProfile(p);
  return {
    systemTitle: x.systemTitle,
    brandName: x.brandName,
    legalName: x.legalName,
    addressText: (x.addressLines || []).join("\n"),
    phone: x.phone,
    email: x.email,
    logoDataUrl: x.logoDataUrl || "",
    bankTitle: x.bank?.title || "",
    bankName: x.bank?.bankName || "",
    accountName: x.bank?.accountName || "",
    accountNumber: x.bank?.accountNumber || "",
    swiftCode: x.bank?.swiftCode || "",
    termsTitle: x.terms?.title || "",
    termsText: (x.terms?.lines || []).join("\n"),
  };
}

export default function Settings() {
  const { isAdmin, user: currentUser } = useAuth();
  const { profile, loading: profileLoading, refresh: refreshCompany } = useCompanyProfile();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState("staff");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, setPending] = useState(false);

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersErr, setUsersErr] = useState("");

  const [companyForm, setCompanyForm] = useState(null);
  const [companyMsg, setCompanyMsg] = useState("");
  const [companyErr, setCompanyErr] = useState("");
  const [companySaving, setCompanySaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdErr, setPwdErr] = useState("");
  const [pwdPending, setPwdPending] = useState(false);

  const [backupPending, setBackupPending] = useState(false);
  const [backupMsg, setBackupMsg] = useState("");
  const [backupErr, setBackupErr] = useState("");

  useEffect(() => {
    if (profileLoading || companyForm !== null) return;
    setCompanyForm(formFromProfile(profile));
  }, [profileLoading, profile, companyForm]);

  async function loadUsers() {
    setUsersErr("");
    setUsersLoading(true);
    try {
      const list = await authApi.listUsers();
      setUsers(list);
    } catch (x) {
      setUsersErr(x.message || "Could not load users");
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    loadUsers();
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/" replace />;

  async function onDeleteUser(u) {
    const label = `${u.username} (${u.role})`;
    if (!window.confirm(`Delete user "${label}"? They will not be able to log in again.`)) return;
    setUsersErr("");
    try {
      await authApi.removeUser(u.id);
      await loadUsers();
    } catch (x) {
      setUsersErr(x.message || "Could not delete user");
    }
  }

  async function onResetPassword(u) {
    const newPass = window.prompt(`New password for "${u.username}" (min 6 characters):`);
    if (newPass == null) return;
    if (newPass.length < 6) {
      setUsersErr("Password must be at least 6 characters.");
      return;
    }
    setUsersErr("");
    setMsg("");
    try {
      await authApi.resetUserPassword(u.id, { newPassword: newPass });
      setMsg(`Password renewed for ${u.username}.`);
    } catch (x) {
      setUsersErr(x.message || "Could not reset password");
    }
  }

  async function onRenewMyPassword(e) {
    e.preventDefault();
    setPwdErr("");
    setPwdMsg("");
    if (newPassword !== confirmPassword) {
      setPwdErr("New password and confirmation do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setPwdErr("New password must be at least 6 characters.");
      return;
    }
    setPwdPending(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      setPwdMsg("Your password was renewed.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (x) {
      setPwdErr(x.message || "Could not update password");
    } finally {
      setPwdPending(false);
    }
  }

  async function onSubmitUser(e) {
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
      await loadUsers();
    } catch (x) {
      setErr(x.message || "Failed");
    } finally {
      setPending(false);
    }
  }

  async function downloadBackup(kind) {
    setBackupErr("");
    setBackupMsg("");
    setBackupPending(true);
    try {
      const data = await backupApi.exportAll();
      const stamp = (data.meta?.exportedAt || new Date().toISOString()).slice(0, 10);
      const counts = data.meta?.counts || {};

      if (kind === "json" || kind === "all") {
        const { csv: _csv, ...jsonBody } = data;
        const text = JSON.stringify(jsonBody, null, 2);
        downloadBlob(`samakaab-backup-${stamp}.json`, new Blob([text], { type: "application/json;charset=utf-8" }));
      }

      if (kind === "csv" || kind === "all") {
        const bom = "\uFEFF";
        for (const [name, text] of Object.entries(data.csv || {})) {
          downloadBlob(`samakaab-${name}-${stamp}.csv`, new Blob([bom + text], { type: "text/csv;charset=utf-8" }));
        }
      }

      const summary = `${counts.customers ?? 0} customers, ${counts.invoices ?? 0} invoices, ${counts.payments ?? 0} payments`;
      setBackupMsg(
        kind === "all"
          ? `Downloaded full backup (JSON + CSV). ${summary}. Store files safely (USB, OneDrive, etc.).`
          : kind === "json"
            ? `Downloaded JSON backup. ${summary}.`
            : `Downloaded CSV files. ${summary}.`
      );
    } catch (x) {
      setBackupErr(x.message || "Backup failed");
    } finally {
      setBackupPending(false);
    }
  }

  async function onSaveCompany(e) {
    e.preventDefault();
    if (!companyForm) return;
    setCompanyErr("");
    setCompanyMsg("");
    setCompanySaving(true);
    try {
      const addressLines = companyForm.addressText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const termsLines = companyForm.termsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      await settingsApi.updateCompany({
        systemTitle: companyForm.systemTitle.trim(),
        brandName: companyForm.brandName.trim(),
        legalName: companyForm.legalName.trim(),
        addressLines,
        phone: companyForm.phone.trim(),
        email: companyForm.email.trim(),
        logoDataUrl: companyForm.logoDataUrl || "",
        bank: {
          title: companyForm.bankTitle.trim(),
          bankName: companyForm.bankName.trim(),
          accountName: companyForm.accountName.trim(),
          accountNumber: companyForm.accountNumber.trim(),
          swiftCode: companyForm.swiftCode.trim(),
        },
        terms: {
          title: companyForm.termsTitle.trim(),
          lines: termsLines,
        },
      });
      await refreshCompany();
      setCompanyMsg("Company details saved.");
    } catch (x) {
      setCompanyErr(x.message || "Could not save");
    } finally {
      setCompanySaving(false);
    }
  }

  function onLogoFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    if (f.size > 400 * 1024) {
      setCompanyErr("Logo must be under 400KB.");
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      const url = r.result;
      if (typeof url === "string" && url.startsWith("data:image/")) {
        setCompanyForm((prev) => (prev ? { ...prev, logoDataUrl: url } : prev));
      }
    };
    r.readAsDataURL(f);
  }

  function clearLogo() {
    setCompanyForm((prev) => (prev ? { ...prev, logoDataUrl: "" } : prev));
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Settings</h1>

      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Company &amp; branding</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 0 }}>
          Used on printed invoices, delivery notes, customer statements, and the app header. Admin only.
        </p>
        {!companyForm || profileLoading ? (
          <p style={{ color: "var(--muted)" }}>Loading…</p>
        ) : (
          <form onSubmit={onSaveCompany}>
            {companyErr && <p style={{ color: "var(--danger)" }}>{companyErr}</p>}
            {companyMsg && <p style={{ color: "var(--accent)" }}>{companyMsg}</p>}

            <div className="grid grid-2" style={{ marginBottom: "0.75rem" }}>
              <div>
                <label>System name (browser tab)</label>
                <input
                  value={companyForm.systemTitle}
                  onChange={(e) => setCompanyForm({ ...companyForm, systemTitle: e.target.value })}
                  maxLength={120}
                />
              </div>
              <div>
                <label>Short brand (top-left menu)</label>
                <input
                  value={companyForm.brandName}
                  onChange={(e) => setCompanyForm({ ...companyForm, brandName: e.target.value })}
                  maxLength={200}
                />
              </div>
            </div>

            <div style={{ marginBottom: "0.75rem" }}>
              <label>Legal / registered name</label>
              <input
                value={companyForm.legalName}
                onChange={(e) => setCompanyForm({ ...companyForm, legalName: e.target.value })}
                maxLength={200}
              />
            </div>

            <div style={{ marginBottom: "0.75rem" }}>
              <label>Address (one line per row)</label>
              <textarea
                rows={4}
                value={companyForm.addressText}
                onChange={(e) => setCompanyForm({ ...companyForm, addressText: e.target.value })}
              />
            </div>

            <div className="grid grid-2" style={{ marginBottom: "0.75rem" }}>
              <div>
                <label>Phone</label>
                <input value={companyForm.phone} onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })} />
              </div>
              <div>
                <label>Email</label>
                <input
                  type="email"
                  value={companyForm.email}
                  onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                />
              </div>
            </div>

            <div style={{ marginBottom: "0.75rem" }}>
              <label>Logo (PNG/JPG, max ~400KB)</label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={onLogoFile} />
                {companyForm.logoDataUrl ? (
                  <>
                    <img src={companyForm.logoDataUrl} alt="" style={{ maxHeight: 48, maxWidth: 120, objectFit: "contain" }} />
                    <button type="button" className="btn btn-ghost" onClick={clearLogo}>
                      Remove logo
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            <h3 style={{ fontSize: "1rem", margin: "1rem 0 0.5rem" }}>Bank transfer (prints on invoice)</h3>
            <div style={{ marginBottom: "0.5rem" }}>
              <label>Section title</label>
              <input
                value={companyForm.bankTitle}
                onChange={(e) => setCompanyForm({ ...companyForm, bankTitle: e.target.value })}
              />
            </div>
            <div className="grid grid-2" style={{ marginBottom: "0.75rem" }}>
              <div>
                <label>Bank name</label>
                <input
                  value={companyForm.bankName}
                  onChange={(e) => setCompanyForm({ ...companyForm, bankName: e.target.value })}
                />
              </div>
              <div>
                <label>Account name</label>
                <input
                  value={companyForm.accountName}
                  onChange={(e) => setCompanyForm({ ...companyForm, accountName: e.target.value })}
                />
              </div>
              <div>
                <label>Account number</label>
                <input
                  value={companyForm.accountNumber}
                  onChange={(e) => setCompanyForm({ ...companyForm, accountNumber: e.target.value })}
                />
              </div>
              <div>
                <label>SWIFT code</label>
                <input
                  value={companyForm.swiftCode}
                  onChange={(e) => setCompanyForm({ ...companyForm, swiftCode: e.target.value })}
                />
              </div>
            </div>

            <h3 style={{ fontSize: "1rem", margin: "1rem 0 0.5rem" }}>Terms &amp; conditions</h3>
            <div style={{ marginBottom: "0.5rem" }}>
              <label>Title</label>
              <input
                value={companyForm.termsTitle}
                onChange={(e) => setCompanyForm({ ...companyForm, termsTitle: e.target.value })}
              />
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <label>Lines (one per row)</label>
              <textarea
                rows={4}
                value={companyForm.termsText}
                onChange={(e) => setCompanyForm({ ...companyForm, termsText: e.target.value })}
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={companySaving}>
              {companySaving ? "Saving…" : "Save company details"}
            </button>
          </form>
        )}
      </div>

      <div className="card" style={{ marginBottom: "1.25rem", maxWidth: 420 }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Renew my password</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 0 }}>
          Signed in as <strong>{currentUser?.username}</strong>. Enter your current password, then choose a new one.
        </p>
        <form onSubmit={onRenewMyPassword}>
          <div style={{ marginBottom: "0.75rem" }}>
            <label htmlFor="my-current-password">Current password</label>
            <div className="passwordFieldWrap">
              <input
                id="my-current-password"
                type={showCurrent ? "text" : "password"}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
              <button type="button" className="passwordToggle" onClick={() => setShowCurrent((v) => !v)}>
                {showCurrent ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <div style={{ marginBottom: "0.75rem" }}>
            <label htmlFor="my-new-password">New password</label>
            <div className="passwordFieldWrap">
              <input
                id="my-new-password"
                type={showNew ? "text" : "password"}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
              <button type="button" className="passwordToggle" onClick={() => setShowNew((v) => !v)}>
                {showNew ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <div style={{ marginBottom: "0.75rem" }}>
            <label htmlFor="my-confirm-password">Confirm new password</label>
            <div className="passwordFieldWrap">
              <input
                id="my-confirm-password"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
              <button type="button" className="passwordToggle" onClick={() => setShowConfirm((v) => !v)}>
                {showConfirm ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          {pwdErr && <p style={{ color: "var(--danger)" }}>{pwdErr}</p>}
          {pwdMsg && <p style={{ color: "var(--accent)" }}>{pwdMsg}</p>}
          <button type="submit" className="btn btn-primary" disabled={pwdPending}>
            {pwdPending ? "Updating…" : "Renew my password"}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginBottom: "1.25rem", maxWidth: 720 }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Backup data</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 0 }}>
          Download a copy of all customers, invoices, credits, payments, and settings. Do this <strong>weekly</strong> (or daily)
          and keep files in a safe place — Atlas free tier has no automatic backup.
        </p>
        <ul style={{ margin: "0 0 1rem", paddingLeft: "1.25rem", color: "var(--muted)", fontSize: "0.9rem" }}>
          <li>
            <strong>Full backup (JSON)</strong> — complete copy for recovery (passwords not included; reset users after restore).
          </li>
          <li>
            <strong>CSV files</strong> — open in Excel for records / accountant.
          </li>
        </ul>
        {backupErr && <p style={{ color: "var(--danger)" }}>{backupErr}</p>}
        {backupMsg && <p style={{ color: "var(--accent)" }}>{backupMsg}</p>}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" disabled={backupPending} onClick={() => downloadBackup("all")}>
            {backupPending ? "Preparing…" : "Download full backup"}
          </button>
          <button type="button" className="btn" disabled={backupPending} onClick={() => downloadBackup("json")}>
            JSON only
          </button>
          <button type="button" className="btn btn-ghost" disabled={backupPending} onClick={() => downloadBackup("csv")}>
            CSV only (Excel)
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "1.25rem", maxWidth: 640 }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Users</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 0 }}>
          All login accounts. Renew password for any user, or delete staff/admin — except yourself and the last admin.
        </p>
        {msg && <p style={{ color: "var(--accent)" }}>{msg}</p>}
        {usersErr && <p style={{ color: "var(--danger)" }}>{usersErr}</p>}
        {usersLoading ? (
          <p style={{ color: "var(--muted)" }}>Loading users…</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ color: "var(--muted)" }}>
                      No users found.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const isSelf = String(u.id) === String(currentUser?.id);
                    return (
                      <tr key={u.id}>
                        <td>
                          {u.username}
                          {isSelf ? (
                            <span style={{ marginLeft: 6, fontSize: "0.8rem", color: "var(--muted)" }}>(you)</span>
                          ) : null}
                        </td>
                        <td>{u.role === "admin" ? "Admin" : "Staff"}</td>
                        <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                            {!isSelf ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem" }}
                                  onClick={() => onResetPassword(u)}
                                >
                                  Renew password
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem" }}
                                  onClick={() => onDeleteUser(u)}
                                >
                                  Delete
                                </button>
                              </>
                            ) : (
                              <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Use form above</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ maxWidth: 420 }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Create staff or admin account</h2>
        <form onSubmit={onSubmitUser}>
          <div style={{ marginBottom: "0.75rem" }}>
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
          </div>
          <div style={{ marginBottom: "0.75rem" }}>
            <label>Password</label>
            <div className="passwordFieldWrap">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <button
                type="button"
                className="passwordToggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
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
