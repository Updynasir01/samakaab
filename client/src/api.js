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

  let res;
  try {
    res = await fetch(url, { ...options, headers });
  } catch {
    const hint = API_BASE
      ? "Cannot connect to the API. If you see a CORS error in the browser console, set CORS_ORIGIN on Render to your site URL (e.g. https://app.samkab.com) and redeploy the backend."
      : "Network error — set VITE_API_URL to your backend URL and rebuild the frontend.";
    throw new Error(hint);
  }

  if (res.status === 401 && getToken()) {
    setToken(null);
    window.dispatchEvent(new Event("samakaab:logout"));
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

export const invoicesApi = {
  list: (limit) => api(`/invoices${limit ? `?limit=${limit}` : ""}`),
  open: (limit) => api(`/invoices/open${limit ? `?limit=${limit}` : ""}`),
  byCustomer: (customerId) => api(`/invoices/customer/${customerId}`),
  nextNumber: () => api("/invoices/next-number"),
  get: (id) => api(`/invoices/${id}`),
  create: (body) => api("/invoices", { method: "POST", body: JSON.stringify(body) }),
  setLineDelivered: (id, lineItemId, delivered) =>
    api(`/invoices/${id}/delivery`, { method: "PATCH", body: JSON.stringify({ lineItemId, delivered }) }),
  remove: (id) => api(`/invoices/${id}`, { method: "DELETE" }),
};
