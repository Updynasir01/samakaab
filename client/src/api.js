const TOKEN_KEY = "samakaab_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 401 && getToken()) {
    setToken(null);
    window.dispatchEvent(new Event("samakaab:logout"));
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    const err = new Error(data?.message || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const authApi = {
  login: (body) => api("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => api("/auth/me"),
  register: (body) => api("/auth/register", { method: "POST", body: JSON.stringify(body) }),
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
  updateCompany: (body) => api("/settings/company", { method: "PATCH", body: JSON.stringify(body) }),
};

export const invoicesApi = {
  list: (limit) => api(`/invoices${limit ? `?limit=${limit}` : ""}`),
  open: (limit) => api(`/invoices/open${limit ? `?limit=${limit}` : ""}`),
  byCustomer: (customerId) => api(`/invoices/customer/${customerId}`),
  get: (id) => api(`/invoices/${id}`),
  create: (body) => api("/invoices", { method: "POST", body: JSON.stringify(body) }),
  setLineDelivered: (id, lineItemId, delivered) =>
    api(`/invoices/${id}/delivery`, { method: "PATCH", body: JSON.stringify({ lineItemId, delivered }) }),
  remove: (id) => api(`/invoices/${id}`, { method: "DELETE" }),
};
