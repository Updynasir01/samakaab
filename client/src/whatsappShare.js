import { formatMoney } from "./util.js";

const DEFAULT_COUNTRY = String(import.meta.env?.VITE_WHATSAPP_COUNTRY_CODE || "252").replace(/\D/g, "") || "252";

/** Digits only for wa.me (no +). */
export function normalizePhoneForWhatsApp(phone, countryCode = DEFAULT_COUNTRY) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";

  const cc = String(countryCode || DEFAULT_COUNTRY).replace(/\D/g, "");
  if (digits.startsWith(cc)) return digits;

  if (digits.startsWith("0")) {
    digits = digits.replace(/^0+/, "");
    return cc + digits;
  }

  if (digits.length <= 10) return cc + digits;
  return digits;
}

export function buildWhatsAppUrl(phone, message) {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;
  const text = encodeURIComponent(String(message || "").trim());
  return `https://wa.me/${normalized}${text ? `?text=${text}` : ""}`;
}

export function openWhatsAppChat(phone, message) {
  const url = buildWhatsAppUrl(phone, message);
  if (!url) {
    window.alert("This customer has no valid phone number. Add or fix the phone on their profile first.");
    return false;
  }
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

export function buildStatementWhatsAppMessage({
  customerName,
  brandName,
  periodLabel,
  balance,
  lineCount,
  openingBalance,
}) {
  const shop = brandName || "Samakaab Supermarket";
  const lines = [
    `Hello ${customerName || "there"},`,
    "",
    `Your account statement from ${shop}:`,
    `Period: ${periodLabel || "All activity"}`,
  ];
  if (openingBalance > 0) {
    lines.push(`Opening balance: ${formatMoney(openingBalance)}`);
  }
  lines.push(
    `Balance owed: ${formatMoney(balance ?? 0)}`,
    `(${lineCount ?? 0} line${lineCount === 1 ? "" : "s"} on this statement)`,
    "",
    "Download or print the full statement from our office if you need the detailed breakdown.",
    "",
    `— ${shop}`
  );
  return lines.join("\n");
}

export function buildInvoiceWhatsAppMessage({
  customerName,
  brandName,
  invoiceNumber,
  date,
  total,
  paidAtSale,
  remaining,
  paymentStatus,
  orderNumber,
}) {
  const shop = brandName || "Samakaab Supermarket";
  const dateStr = date ? new Date(date).toLocaleDateString() : "—";
  const lines = [
    `Hello ${customerName || "there"},`,
    "",
    `Invoice #${invoiceNumber ?? "—"} from ${shop}`,
    `Date: ${dateStr}`,
  ];
  if (orderNumber) lines.push(`Order: ${orderNumber}`);
  lines.push(
    `Total: ${formatMoney(total ?? 0)}`,
    `Paid at sale: ${formatMoney(paidAtSale ?? 0)}`,
    `Remaining: ${remaining > 0 ? formatMoney(remaining) : "—"}`,
    `Status: ${paymentStatus || "—"}`,
    "",
    "Contact us if you have any questions about this invoice.",
    "",
    `— ${shop}`
  );
  return lines.join("\n");
}
