import { downloadBlob } from "./util.js";

const TOKEN_KEY = "samakaab_token";

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(t) {
  if (t) sessionStorage.setItem(TOKEN_KEY, t);
  else sessionStorage.removeItem(TOKEN_KEY);
}

function normalizeBaseUrl(u) {
  if (!u) return "";
  const s = String(u).trim();
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

const API_BASE = normalizeBaseUrl(import.meta.env?.VITE_API_URL);
const API_TIMEOUT_MS = 90_000;

export function getApiBase() {
  return API_BASE;
}

/** Quick health check (e.g. after tab was idle). */
export async function pingApiHealth(timeoutMs = 25_000) {
  const url = API_BASE ? `${API_BASE}/api/health` : `/api/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function sessionExpired() {
  setToken(null);
  window.dispatchEvent(new Event("samakaab:logout"));
  if (!window.location.pathname.startsWith("/login")) {
    window.location.assign("/login");
  }
}

function parseApiError(text, res) {
  const trimmed = String(text || "").trim();
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    return "Cannot reach the API server. On Vercel, set VITE_API_URL to your backend URL (e.g. https://xxx.onrender.com) and redeploy.";
  }
  try {
    const data = trimmed ? JSON.parse(trimmed) : null;
    return data?.message || res.statusText || "Request failed";
  } catch {
    return trimmed.slice(0, 200) || res.statusText || "Request failed";
  }
}

export async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = API_BASE ? `${API_BASE}/api${path}` : `/api${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, { ...options, headers, signal: controller.signal });
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error(
        "Request timed out. The server may be waking up (wait 30–60 seconds) or your connection is slow — then try again once."
      );
    }
    const hint = API_BASE
      ? "Cannot connect to the API. If you see a CORS error in the browser console, set CORS_ORIGIN on Render to your site URL (e.g. https://app.samkab.com) and redeploy the backend."
      : "Network error — set VITE_API_URL to your backend URL and rebuild the frontend.";
    throw new Error(hint);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 && getToken()) {
    sessionExpired();
    throw new Error("Session expired. Please sign in again.");
  }
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(parseApiError(text, res));
    err.status = res.status;
    try {
      err.data = text ? JSON.parse(text) : null;
    } catch {
      err.data = null;
    }
    throw err;
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(parseApiError(text, res));
  }
}

export const authApi = {
  login: (body) => api("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => api("/auth/me"),
  register: (body) => api("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  listUsers: () => api("/auth/users"),
  removeUser: (id) => api(`/auth/users/${id}`, { method: "DELETE" }),
  changePassword: (body) => api("/auth/password", { method: "PATCH", body: JSON.stringify(body) }),
  resetUserPassword: (id, body) => api(`/auth/users/${id}/password`, { method: "PATCH", body: JSON.stringify(body) }),
};

export const customersApi = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api(`/customers${q ? `?${q}` : ""}`);
  },
  get: (id) => api(`/customers/${id}`),
  create: (body) => api("/customers", { method: "POST", body: JSON.stringify(body) }),
  update: (id, body) => api(`/customers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id) => api(`/customers/${id}`, { method: "DELETE" }),
};

export const creditsApi = {
  byCustomer: (customerId) => api(`/credits/customer/${customerId}`),
  search: (q) => api(`/credits/search?q=${encodeURIComponent(q)}`),
  create: (body) => api("/credits", { method: "POST", body: JSON.stringify(body) }),
  remove: (id) => api(`/credits/${id}`, { method: "DELETE" }),
};

export const paymentsApi = {
  byCustomer: (customerId) => api(`/payments/customer/${customerId}`),
  create: (body) => api("/payments", { method: "POST", body: JSON.stringify(body) }),
  remove: (id) => api(`/payments/${id}`, { method: "DELETE" }),
};

export const dashboardApi = {
  summary: () => api("/dashboard/summary"),
};

export const reportsApi = {
  monthly: (year, month) => api(`/reports/monthly?year=${year}&month=${month}`),
  yearly: (year) => api(`/reports/yearly?year=${year}`),
};

export const settingsApi = {
  getCompany: () => api("/settings/company"),
  getCompanyPublic: () => api("/settings/company-public"),
  updateCompany: (body) => api("/settings/company", { method: "PATCH", body: JSON.stringify(body) }),
};

export const backupApi = {
  exportAll: () => api("/backup"),
  onedriveStatus: () => api("/backup/onedrive/status"),
  onedriveAuthUrl: () => api("/backup/onedrive/auth-url"),
  onedriveDisconnect: () => api("/backup/onedrive/disconnect", { method: "POST" }),
  onedriveSetSchedule: (schedule) =>
    api("/backup/onedrive/schedule", { method: "PATCH", body: JSON.stringify({ schedule }) }),
  onedriveUpload: () => api("/backup/onedrive/upload", { method: "POST" }),
  async downloadZip() {
    const token = getToken();
    const url = API_BASE ? `${API_BASE}/api/backup/zip` : `/api/backup/zip`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const text = await res.text();
      let msg = res.statusText;
      try {
        const data = JSON.parse(text);
        msg = data.message || msg;
      } catch {
        if (text) msg = text.slice(0, 200);
      }
      throw new Error(msg || "Download failed");
    }
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") || "";
    const match = cd.match(/filename="([^"]+)"/);
    const filename = match?.[1] || `samakaab-backup-${new Date().toISOString().slice(0, 10)}.zip`;
    downloadBlob(filename, blob);
  },
};

export const invoicesApi = {
  list: (params = {}) => {
    const q = new URLSearchParams();
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.skip != null) q.set("skip", String(params.skip));
    if (params.q) q.set("q", params.q);
    if (params.status && params.status !== "all") q.set("status", params.status);
    if (params.date) q.set("date", params.date);
    if (params.year != null && params.year !== "") q.set("year", String(params.year));
    const qs = q.toString();
    return api(`/invoices${qs ? `?${qs}` : ""}`);
  },
  open: (limit) => api(`/invoices/open${limit ? `?limit=${limit}` : ""}`),
  byCustomer: (customerId) => api(`/invoices/customer/${customerId}`),
  nextNumber: () => api("/invoices/next-number"),
  get: (id) => api(`/invoices/${id}`),
  create: (body) => api("/invoices", { method: "POST", body: JSON.stringify(body) }),
  update: (id, body) => api(`/invoices/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  setLineDelivered: (id, lineItemId, delivered) =>
    api(`/invoices/${id}/delivery`, { method: "PATCH", body: JSON.stringify({ lineItemId, delivered }) }),
  setAllDelivered: (id, delivered) =>
    api(`/invoices/${id}/delivery`, { method: "PATCH", body: JSON.stringify({ all: true, delivered }) }),
  remove: (id) => api(`/invoices/${id}`, { method: "DELETE" }),
};
