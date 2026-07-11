import { safeFileSegment } from "./util.js";
import { htmlToPdfBlob } from "./htmlToPdf.js";

const DEFAULT_COUNTRY = String(import.meta.env?.VITE_WHATSAPP_COUNTRY_CODE || "252").replace(/\D/g, "") || "252";

/** Digits only for wa.me / WhatsApp Web (no +). */
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

/** Opens WhatsApp Web in the browser. */
export function buildWhatsAppWebUrl(phone, message) {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;
  const text = encodeURIComponent(String(message || "").trim());
  return `https://web.whatsapp.com/send?phone=${normalized}${text ? `&text=${text}` : ""}`;
}

/** App / mobile deep link. */
export function buildWhatsAppUrl(phone, message) {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;
  const text = encodeURIComponent(String(message || "").trim());
  return `https://wa.me/${normalized}${text ? `?text=${text}` : ""}`;
}

export function openWhatsAppChat(phone, message, { preferWeb = false } = {}) {
  const url = preferWeb ? buildWhatsAppWebUrl(phone, message) : buildWhatsAppUrl(phone, message);
  if (!url) {
    window.alert("This customer has no valid phone number. Add or fix the phone on their profile first.");
    return false;
  }
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

function triggerDownload(file) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name || "document.pdf";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

async function tryNativeShare(pdfFile, caption) {
  const shareData = {
    files: [pdfFile],
    title: pdfFile.name,
    text: caption || "",
  };
  if (typeof navigator.canShare !== "function" || !navigator.canShare(shareData)) {
    return { ok: false, reason: "unsupported" };
  }
  try {
    await navigator.share(shareData);
    return { ok: true };
  } catch (e) {
    if (e?.name === "AbortError") return { ok: false, reason: "cancelled" };
    return { ok: false, reason: "failed" };
  }
}

/**
 * Share a PDF via WhatsApp.
 * @param {"app"|"web"} mode
 *   - app: system share sheet → pick WhatsApp (can auto-attach PDF)
 *   - web: download PDF + open WhatsApp Web (manual paperclip attach)
 */
export async function sharePdfViaWhatsApp({ phone, file, caption, mode = "app" }) {
  if (!normalizePhoneForWhatsApp(phone)) {
    window.alert("This customer has no valid phone number. Add or fix the phone on their profile first.");
    return { ok: false, mode: "error" };
  }

  const pdfFile =
    file instanceof File
      ? file
      : new File([file], "document.pdf", { type: "application/pdf" });

  const shortCaption = caption || `Hello,\n\nPlease see the PDF: ${pdfFile.name}`;

  if (mode === "app") {
    const shared = await tryNativeShare(pdfFile, shortCaption);
    if (shared.ok) return { ok: true, mode: "app" };
    if (shared.reason === "cancelled") return { ok: false, mode: "cancelled" };

    // Fallback when Share sheet is unavailable: download + open WhatsApp app link
    triggerDownload(pdfFile);
    const proceed = window.confirm(
      `PDF downloaded: “${pdfFile.name}”\n\n` +
        `Share sheet is not available here.\n\n` +
        `1. Click OK to open WhatsApp\n` +
        `2. Tap paperclip (+) → Document\n` +
        `3. Choose “${pdfFile.name}” from Downloads\n` +
        `4. Then send`
    );
    if (!proceed) return { ok: false, mode: "cancelled" };
    openWhatsAppChat(phone, shortCaption, { preferWeb: false });
    return { ok: true, mode: "app-fallback" };
  }

  // WhatsApp Web (browser) — cannot auto-attach
  triggerDownload(pdfFile);
  const proceed = window.confirm(
    `PDF downloaded: “${pdfFile.name}”\n\n` +
      `WhatsApp Web cannot auto-attach files.\n\n` +
      `1. Click OK to open WhatsApp Web\n` +
      `2. Click paperclip (+) → Document\n` +
      `3. Pick “${pdfFile.name}” from Downloads\n` +
      `4. Then send\n\n` +
      `Do not press Send until the PDF is attached.`
  );
  if (!proceed) return { ok: false, mode: "cancelled" };
  openWhatsAppChat(phone, shortCaption, { preferWeb: true });
  return { ok: true, mode: "web" };
}

/** Build print-layout PDF and share to WhatsApp (mode: "app" | "web"). */
export async function shareHtmlPdfViaWhatsApp({
  phone,
  html,
  filename,
  caption,
  orientation = "portrait",
  mode = "app",
}) {
  const file = await htmlToPdfBlob(html, { filename, orientation });
  return sharePdfViaWhatsApp({ phone, file, caption, mode });
}

export function buildStatementWhatsAppCaption({ customerName, brandName, periodLabel }) {
  const shop = brandName || "Samakaab Supermarket";
  return `Hello ${customerName || "there"},\n\nPlease find your account statement from ${shop}${
    periodLabel ? ` (${periodLabel})` : ""
  } — see the PDF document.\n\n— ${shop}`;
}

export function buildInvoiceWhatsAppCaption({ customerName, brandName, invoiceNumber, isWalkIn = false }) {
  const shop = brandName || "Samakaab Supermarket";
  const docLabel = isWalkIn ? "cash receipt" : "invoice";
  return `Hello ${customerName || "there"},\n\nPlease find ${docLabel} #${invoiceNumber ?? "—"} from ${shop} — see the PDF document.\n\n— ${shop}`;
}

export function statementPdfFilename(customer, filters = {}) {
  const bits = [safeFileSegment(customer?.fullName || "customer"), "statement"];
  if (filters.year && filters.month) {
    bits.push(`${filters.year}-${String(filters.month).padStart(2, "0")}`);
  }
  if (filters.invoiceStatus && filters.invoiceStatus !== "all") {
    bits.push(filters.invoiceStatus);
  }
  return `${bits.join("-")}.pdf`;
}

export function invoicePdfFilename(inv) {
  const isWalkIn = !inv?.customer;
  const label = isWalkIn ? "cash-receipt" : "invoice";
  return `${safeFileSegment(`${label}-${inv?.invoiceNumber ?? "x"}`)}.pdf`;
}

export function buildStatementWhatsAppMessage(opts) {
  return buildStatementWhatsAppCaption(opts);
}

export function buildInvoiceWhatsAppMessage(opts) {
  return buildInvoiceWhatsAppCaption({
    customerName: opts.customerName,
    brandName: opts.brandName,
    invoiceNumber: opts.invoiceNumber,
  });
}
