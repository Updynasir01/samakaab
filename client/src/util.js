export function formatMoney(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-SO", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

/** Match server BALANCE_EPS — amounts at or below this are treated as zero. */
export const BALANCE_EPS = 0.005;

/** Payment notes that duplicate cash already counted via paidAtSale. */
export const EXCLUDED_PAYMENT_NOTE = /paid in full|payment at sale/i;

export function isExcludedPaymentNote(note) {
  return EXCLUDED_PAYMENT_NOTE.test(String(note || ""));
}

/** Show at-sale cash row unless a matching paid-in-full entry already represents it. */
export function shouldShowAtSalePayRow(invoice, payments) {
  const pas = Number(invoice?.paidAtSale || 0);
  if (pas <= BALANCE_EPS) return false;
  const hasFullPayEntry = (payments || []).some(
    (p) => p.invoice && String(p.invoice) === String(invoice._id) && /paid in full/i.test(p.note || "")
  );
  return !hasFullPayEntry;
}

export function toInputDate(d) {
  const x = d instanceof Date ? d : new Date(d);
  return x.toISOString().slice(0, 10);
}

export function todayISO() {
  return toInputDate(new Date());
}

/** Escape a cell for CSV (RFC-style). */
export function csvEscapeCell(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build one CSV line from string cells. */
export function csvLine(cells) {
  return cells.map(csvEscapeCell).join(",");
}

/** Trigger download of a UTF-8 CSV file (with BOM for Excel). */
export function downloadCsv(filename, header, rows) {
  const lines = [csvLine(header), ...rows.map((r) => csvLine(r))];
  const BOM = "\uFEFF";
  const text = BOM + lines.join("\r\n");
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function enteredByLabel(record) {
  const v = record?.createdBy;
  return v && String(v).trim() ? String(v) : "—";
}

/** Total credit paid down on an invoice (linked payments + FIFO from customer account). */
export function invoiceLaterPayments(inv) {
  if (inv?.paymentsApplied != null) return Number(inv.paymentsApplied) || 0;
  return Number(inv?.paymentsRecorded) || 0;
}

/** Client-side filter for invoice lists (customer page, all invoices, payment link). */
export function invoiceMatchesFilter(inv, q, { status = "all", customerName = "", date = "" } = {}) {
  if (status !== "all" && inv.paymentStatus !== status) return false;
  if (date && toInputDate(inv.date) !== date) return false;
  const needle = String(q || "").trim().toLowerCase();
  if (!needle) return true;
  const dateStr = toInputDate(inv.date);
  const parts = [
    inv.invoiceNumber,
    inv.orderNumber,
    inv.orderNo,
    inv.paymentStatus,
    inv.note,
    dateStr,
    inv.total,
    customerName,
    inv.customer?.fullName,
    inv.customer?.phone,
    inv.createdBy,
    ...(inv.lineItems || []).map((li) => li.description),
  ];
  const hay = parts
    .filter((x) => x != null && String(x).trim() !== "")
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

export function safeFileSegment(s) {
  return String(s || "export")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "export";
}
