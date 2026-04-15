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
  const dateShort = inv?.date ? new Date(inv.date).toLocaleDateString() : "";
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
  const subtotal = Number(inv.total ?? 0);
  const credit = Number(inv.creditAmount ?? 0);

  // Optional invoice extras (not required by the data model).
  const vat = Number(inv?.vat ?? 0) || 0;
  const deliveryCost = Number(inv?.deliveryCost ?? 0) || 0;
  const insurance = Number(inv?.insurance ?? 0) || 0;
  const discount = Number(inv?.discount ?? 0) || 0;
  const grandTotal = Math.max(0, subtotal + vat + deliveryCost + insurance - discount);
  const amountDue = isDelivery ? 0 : Math.max(0, credit > 0 ? credit : grandTotal);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(docTitle)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  /* Try hard to preserve background colors when printing. */
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; margin: 0; font-size: 11pt; }
  .wrap { padding: 0; }
  .top { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: start; }
  .brandRow { display: flex; gap: 12px; align-items: flex-start; }
  .brand h1 { margin: 0; font-size: 18pt; letter-spacing: 0.2px; }
  .brand .sub { margin: 2px 0 0 0; color: #6b7280; font-size: 10pt; line-height: 1.25; }
  .centerTitle { text-align: center; padding-top: 4px; }
  .centerTitle h2 { margin: 0; font-size: 26pt; letter-spacing: 1.6px; }
  .contact { text-align: right; color: #111827; font-size: 10pt; line-height: 1.25; }
  .contact .muted { color: #6b7280; }
  .bar { height: 3px; background: #0ea5e9; margin: 8px 0 12px; }

  .pillRow { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 10px; }
  .pill { display: inline-block; background: #0ea5e9; color: #fff; font-weight: 800; font-size: 10pt; letter-spacing: 0.4px; padding: 6px 12px; border-radius: 4px; }
  .pill.right { float: right; }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 12px; }
  .box { border: 1px solid #d1d5db; border-radius: 0; padding: 10px 12px; }
  .box .label { font-size: 9pt; color: #6b7280; font-weight: 700; margin-bottom: 6px; }
  .box .value { font-size: 11pt; font-weight: 700; }
  .box .muted { color: #374151; font-weight: 600; font-size: 10pt; margin-top: 3px; }

  .detailsStrip { width: 100%; border-collapse: collapse; margin: 6px 0 10px; }
  .detailsStrip th, .detailsStrip td { border: 1px solid #d1d5db; padding: 7px 10px; }
  .detailsStrip th { background: #c7e6a4; color: #111827; font-weight: 800; font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.3px; }
  .detailsStrip td { background: #fff; font-weight: 700; }

  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #d1d5db; padding: 8px 10px; }
  th { background: #bfe8ff; color: #0f172a; font-size: 9.5pt; letter-spacing: 0.2px; font-weight: 900; }
  .bottom { margin-top: 12px; display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 14px; align-items: start; }
  .totals { width: 100%; border-collapse: collapse; }
  .totals td { border: 1px solid #d1d5db; padding: 7px 10px; }
  .totals tr td:first-child { background: #f3f4f6; font-weight: 800; color: #374151; }
  .totals tr td:last-child { text-align: right; font-weight: 800; }
  .totals .grand td { background: #0ea5e9; color: #fff; font-weight: 900; }
  .note { margin-top: 10px; color: #374151; font-size: 10pt; line-height: 1.35; }
  .footer { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .sig { border-top: 1px solid #9ca3af; padding-top: 6px; text-align: center; color: #374151; font-size: 10pt; font-weight: 800; }
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
          </div>
        </div>
      </div>
      <div class="centerTitle">
        <h2>${escapeHtml(title.toUpperCase())}</h2>
      </div>
      <div class="contact">
        ${(company.addressLines || []).map((l) => `<div>${escapeHtml(l)}</div>`).join("")}
        ${company.phone ? `<div><span class="muted">Phone :</span> ${escapeHtml(company.phone)}</div>` : ""}
        ${company.email ? `<div><span class="muted">E-mail:</span> ${escapeHtml(company.email)}</div>` : ""}
      </div>
    </div>
    <div class="bar"></div>

    <div class="pillRow">
      <div><span class="pill">TO :</span></div>
      <div><span class="pill right">INVOICE DETAILS</span></div>
    </div>

    <div class="grid">
      <div class="box">
        <div class="value">${escapeHtml(customerName)}</div>
        ${customerPhone ? `<div class="muted">${escapeHtml(customerPhone)}</div>` : ""}
        ${customerAddress ? `<div class="muted">${escapeHtml(customerAddress)}</div>` : ""}
      </div>
      <div class="box">
        <div class="muted"><strong>Status:</strong> ${escapeHtml(inv.paymentStatus ?? "")}</div>
        ${isDelivery ? "" : `<div class="muted"><strong>Paid at sale:</strong> ${escapeHtml(formatMoney(paidAtSale))}</div>`}
        ${isDelivery ? "" : `<div class="muted"><strong>Payments recorded:</strong> ${escapeHtml(formatMoney(paymentsRecorded))}</div>`}
      </div>
    </div>

    <table class="detailsStrip">
      <thead>
        <tr>
          <th>DATE</th>
          <th>INVOICE</th>
          <th>Order No</th>
          <th>Amount Due</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(dateShort || dateStr)}</td>
          <td>${escapeHtml(`INV-${inv.invoiceNumber ?? ""}`)}</td>
          <td>${escapeHtml(inv.orderNo ?? inv.orderNumber ?? "—")}</td>
          <td>${isDelivery ? "—" : escapeHtml(formatMoney(amountDue))}</td>
        </tr>
      </tbody>
    </table>

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
        : `<div class="bottom">
      <div>
        ${
          company.bank
            ? `<div class="box">
          <div class="label">${escapeHtml(company.bank.title || "Money transfer to the account below:")}</div>
          <div class="muted"><strong>Bank Name:</strong> ${escapeHtml(company.bank.bankName || "")}</div>
          <div class="muted"><strong>Account Name:</strong> ${escapeHtml(company.bank.accountName || "")}</div>
          <div class="muted"><strong>Account Number:</strong> ${escapeHtml(company.bank.accountNumber || "")}</div>
          <div class="muted"><strong>Swift CODE:</strong> ${escapeHtml(company.bank.swiftCode || "")}</div>
        </div>`
            : ""
        }

        ${
          company.terms
            ? `<div class="note">
          <strong>${escapeHtml(company.terms.title || "Terms & Conditions:")}</strong><br/>
          ${(company.terms.lines || []).map((l, i) => `${i + 1}. ${escapeHtml(l)}`).join("<br/>")}
        </div>`
            : ""
        }

        ${note ? `<div class="note"><strong>Note:</strong> ${escapeHtml(note)}</div>` : ""}
      </div>
      <div>
        <table class="totals">
          <tbody>
            <tr><td>Subtotal</td><td>${escapeHtml(formatMoney(subtotal))}</td></tr>
            <tr><td>VAT</td><td>${vat ? escapeHtml(formatMoney(vat)) : ""}</td></tr>
            <tr><td>Delivery Cost</td><td>${deliveryCost ? escapeHtml(formatMoney(deliveryCost)) : ""}</td></tr>
            <tr><td>Insurance</td><td>${insurance ? escapeHtml(formatMoney(insurance)) : ""}</td></tr>
            <tr><td>Discount</td><td>${discount ? escapeHtml(formatMoney(discount)) : ""}</td></tr>
            <tr class="grand"><td>TOTAL</td><td>${escapeHtml(formatMoney(grandTotal))}</td></tr>
          </tbody>
        </table>
      </div>
    </div>`
    }

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
