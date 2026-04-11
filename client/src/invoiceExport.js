import { formatMoney, safeFileSegment } from "./util.js";
import { DEFAULT_COMPANY } from "./companyProfile.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeLogoHtml(company) {
  const u = company?.logoDataUrl;
  if (typeof u !== "string" || u.length > 800000) return "";
  if (!/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(u)) return "";
  return `<img src="${u.replace(/"/g, "")}" alt="" style="max-height:56px;max-width:140px;object-fit:contain" />`;
}

export function buildInvoiceHtml(inv, { kind, company: companyIn }) {
  const company = companyIn || DEFAULT_COMPANY;
  const isDelivery = kind === "delivery";
  const title = isDelivery ? "Delivery Note" : "Invoice";
  const docTitle = `${company.brandName} — ${title} #${inv.invoiceNumber ?? ""}`.trim();

  const dateStr = inv?.date ? new Date(inv.date).toLocaleString() : "";
  const customerName = inv?.customer?.fullName || "Walk-in";
  const customerPhone = inv?.customer?.phone || "";
  const customerAddress = inv?.customer?.address || "";
  const note = inv?.note || "";

  const logoBlock = safeLogoHtml(company);

  const rows = (inv.lineItems || [])
    .map((li, idx) => {
      const qty = Number(li.quantity ?? 0);
      const unitPrice = Number(li.unitPrice ?? 0);
      const lineTotal = Number(li.lineTotal ?? qty * unitPrice);
      return `<tr>
  ${
    isDelivery
      ? `<td style="width:34px; text-align:center; font-size:12pt">${li?.delivered ? "☑" : "☐"}</td>`
      : ""
  }
  <td style="width:44px; text-align:center">${idx + 1}</td>
  <td>${escapeHtml(li.description)}</td>
  <td style="width:92px; text-align:right">${escapeHtml(qty)}</td>
  <td style="width:92px; text-align:center">${escapeHtml(li.unit || "—")}</td>
  ${
    isDelivery
      ? ""
      : `<td style="width:110px; text-align:right">${escapeHtml(formatMoney(unitPrice))}</td>
  <td style="width:120px; text-align:right">${escapeHtml(formatMoney(lineTotal))}</td>`
  }
</tr>`;
    })
    .join("");

  const paidAtSale = Number(inv.paidAtSale ?? 0);
  const paymentsRecorded = Number(inv.paymentsRecorded ?? 0);
  const total = Number(inv.total ?? 0);
  const credit = Number(inv.creditAmount ?? 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(docTitle)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; margin: 0; font-size: 11pt; }
  .wrap { padding: 0; }
  .top { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; }
  .brandRow { display: flex; gap: 12px; align-items: flex-start; }
  .brand h1 { margin: 0; font-size: 18pt; letter-spacing: 0.2px; }
  .brand .sub { margin: 2px 0 0 0; color: #6b7280; font-size: 10pt; line-height: 1.25; }
  .docTitle { text-align: right; }
  .docTitle h2 { margin: 0; font-size: 22pt; letter-spacing: 1px; }
  .docTitle .meta { margin: 6px 0 0 0; color: #374151; font-size: 10pt; line-height: 1.35; }
  .bar { height: 3px; background: #0ea5e9; margin: 10px 0 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 10px; }
  .box { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; }
  .box .label { font-size: 9pt; color: #6b7280; font-weight: 600; margin-bottom: 6px; }
  .box .value { font-size: 11pt; font-weight: 600; }
  .box .muted { color: #6b7280; font-weight: 400; font-size: 10pt; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #d1d5db; padding: 8px 10px; }
  th { background: #e0f2fe; color: #0f172a; font-size: 9.5pt; letter-spacing: 0.2px; }
  .totals { margin-top: 10px; display: flex; justify-content: flex-end; }
  .totals table { width: 360px; }
  .totals td { border: 1px solid #d1d5db; padding: 7px 10px; }
  .totals tr td:first-child { background: #f3f4f6; font-weight: 700; color: #374151; }
  .totals tr td:last-child { text-align: right; font-weight: 700; }
  .footer { margin-top: 16px; display: flex; justify-content: space-between; gap: 12px; }
  .sig { flex: 1; border-top: 1px solid #9ca3af; padding-top: 6px; text-align: center; color: #374151; font-size: 10pt; }
  .note { margin-top: 10px; color: #374151; font-size: 10pt; line-height: 1.35; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div class="brand">
        <div class="brandRow">
          ${logoBlock}
          <div>
            <h1>${escapeHtml(company.legalName)}</h1>
            <p class="sub">${escapeHtml((company.addressLines || []).join(" · "))}</p>
            ${company.phone ? `<p class="sub">Phone: ${escapeHtml(company.phone)}</p>` : ""}
            ${company.email ? `<p class="sub">Email: ${escapeHtml(company.email)}</p>` : ""}
          </div>
        </div>
      </div>
      <div class="docTitle">
        <h2>${escapeHtml(title.toUpperCase())}</h2>
        <div class="meta">
          <div><strong>Date:</strong> ${escapeHtml(dateStr)}</div>
          <div><strong>Invoice #:</strong> ${escapeHtml(inv.invoiceNumber ?? "")}</div>
          ${inv.orderNo ? `<div><strong>Order No:</strong> ${escapeHtml(inv.orderNo)}</div>` : ""}
          ${!isDelivery ? `<div><strong>Amount due:</strong> ${escapeHtml(formatMoney(credit))}</div>` : ""}
        </div>
      </div>
    </div>
    <div class="bar"></div>
    <div class="grid">
      <div class="box">
        <div class="label">To</div>
        <div class="value">${escapeHtml(customerName)}</div>
        ${customerPhone ? `<div class="muted">${escapeHtml(customerPhone)}</div>` : ""}
        ${customerAddress ? `<div class="muted">${escapeHtml(customerAddress)}</div>` : ""}
      </div>
      <div class="box">
        <div class="label">Invoice details</div>
        <div class="muted"><strong>Status:</strong> ${escapeHtml(inv.paymentStatus ?? "")}</div>
        ${isDelivery ? "" : `<div class="muted"><strong>Paid at sale:</strong> ${escapeHtml(formatMoney(paidAtSale))}</div>`}
        ${isDelivery ? "" : `<div class="muted"><strong>Payments recorded:</strong> ${escapeHtml(formatMoney(paymentsRecorded))}</div>`}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          ${isDelivery ? `<th style="width:34px"></th>` : ""}
          <th style="width:44px">#</th>
          <th>Description</th>
          <th style="width:92px">Quantity</th>
          <th style="width:92px">Unit</th>
          ${isDelivery ? "" : `<th style="width:110px">Price</th><th style="width:120px">Total</th>`}
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="${isDelivery ? 5 : 6}" style="color:#6b7280">No line items.</td></tr>`}
      </tbody>
    </table>

    ${
      isDelivery
        ? ""
        : `<div class="totals">
      <table>
        <tbody>
          <tr><td>Subtotal</td><td>${escapeHtml(formatMoney(total))}</td></tr>
          <tr><td>On credit (amount due)</td><td>${escapeHtml(formatMoney(credit))}</td></tr>
          <tr><td>Total</td><td>${escapeHtml(formatMoney(total))}</td></tr>
        </tbody>
      </table>
    </div>`
    }

    ${
      company.bank
        ? `<div class="grid" style="margin-top:12px">
      <div class="box">
        <div class="label">${escapeHtml(company.bank.title || "Bank transfer")}</div>
        <div class="muted"><strong>Bank Name:</strong> ${escapeHtml(company.bank.bankName || "")}</div>
        <div class="muted"><strong>Account Name:</strong> ${escapeHtml(company.bank.accountName || "")}</div>
        <div class="muted"><strong>Account Number:</strong> ${escapeHtml(company.bank.accountNumber || "")}</div>
        <div class="muted"><strong>Swift Code:</strong> ${escapeHtml(company.bank.swiftCode || "")}</div>
      </div>
      <div class="box">
        <div class="label">${escapeHtml(company.terms?.title || "Terms")}</div>
        <div class="muted">${escapeHtml((company.terms?.lines || []).join(" "))}</div>
      </div>
    </div>`
        : ""
    }

    ${note ? `<div class="note"><strong>Note:</strong> ${escapeHtml(note)}</div>` : ""}

    <div class="footer">
      <div class="sig">DELIVERED BY</div>
      <div class="sig">RECEIVED BY</div>
    </div>
  </div>
</body>
</html>`;
}

export function printInvoiceFromHtml(html) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
    w.close();
  }, 300);
}

export function downloadInvoiceHtml(inv, { kind, company }) {
  const html = buildInvoiceHtml(inv, { kind, company });
  const ext = "html";
  const label = kind === "delivery" ? "delivery-note" : "invoice";
  const name = `${label}-${inv.invoiceNumber ?? "x"}`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${safeFileSegment(name)}.${ext}`;
  a.click();
  URL.revokeObjectURL(a.href);
}
