import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { useCompanyProfile } from "../companySettings.jsx";
import { authApi, settingsApi } from "../api.js";
import { mergeCompanyProfile } from "../companyProfile.js";

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
  const { isAdmin } = useAuth();
  const { profile, loading: profileLoading, refresh: refreshCompany } = useCompanyProfile();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("staff");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, setPending] = useState(false);

  const [companyForm, setCompanyForm] = useState(null);
  const [companyMsg, setCompanyMsg] = useState("");
  const [companyErr, setCompanyErr] = useState("");
  const [companySaving, setCompanySaving] = useState(false);

  useEffect(() => {
    if (profileLoading || companyForm !== null) return;
    setCompanyForm(formFromProfile(profile));
  }, [profileLoading, profile, companyForm]);

  if (!isAdmin) return <Navigate to="/" replace />;

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
    } catch (x) {
      setErr(x.message || "Failed");
    } finally {
      setPending(false);
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

      <div className="card" style={{ maxWidth: 420 }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Create staff or admin account</h2>
        <form onSubmit={onSubmitUser}>
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
