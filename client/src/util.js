export function formatMoney(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-SO", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
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

export function safeFileSegment(s) {
  return String(s || "export")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "export";
}
