import { jsPDF } from "jspdf";
import { formatMoney, safeFileSegment } from "./util.js";
import { DEFAULT_COMPANY } from "./companyProfile.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * HTML for Word (.doc), print preview, same layout as PDF.
 * No "Account report" title — customer name + statement wording only.
 * @param {object} company - from useCompanyProfile().profile
 */
export function buildAccountReportHtml(customer, rows, { totalCredit, totalPayments, balance }, company = DEFAULT_COMPANY) {
  const c = company || DEFAULT_COMPANY;
  const invCell = (r) => (r.invoiceNum != null ? `#${r.invoiceNum}` : "—");
  const rowHtml = rows
    .map(
      (r) => `<tr>
    <td>${escapeHtml(r.date)}</td>
    <td>${escapeHtml(r.dis)}</td>
    <td>${escapeHtml(r.due)}</td>
    <td>${escapeHtml(r.detail)}</td>
    <td>${escapeHtml(invCell(r))}</td>
    <td style="text-align:right">${escapeHtml(formatMoney(r.amount))}</td>
  </tr>`
    )
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(customer.fullName)} — statement</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1c2834; margin: 24px; font-size: 11pt; }
  h1 { font-size: 1.25rem; margin: 0 0 4px 0; font-weight: 700; }
  .meta { color: #555; font-size: 10pt; margin: 0 0 12px 0; }
  .note { color: #5a6b7a; font-size: 9pt; margin: 0 0 16px 0; line-height: 1.45; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #d4dde6; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #eef2f6; color: #5a6b7a; font-weight: 600; font-size: 9pt; }
  tfoot td { background: #eef2f6; font-weight: 600; }
  tfoot td:first-child { text-align: right; padding-right: 12px; }
  tfoot td:last-child { text-align: right; }
</style>
</head>
<body>
  <h1>${escapeHtml(customer.fullName)}</h1>
  <p class="meta">
    ${escapeHtml(c.legalName)}${customer.phone ? ` · ${escapeHtml(customer.phone)}` : ""} · ${escapeHtml(new Date().toLocaleDateString())}<br/>
    ${escapeHtml((c.addressLines || []).join(" · "))}<br/>
    ${c.phone ? `Phone: ${escapeHtml(c.phone)}` : ""}${c.phone && c.email ? " · " : ""}${c.email ? `Email: ${escapeHtml(c.email)}` : ""}
  </p>
  <p class="note">All money lines in date order. <strong>Dis</strong>: <em>Credit</em> (amount put on account), <em>Payment recorded</em> (Add payment), <em>At sale pay</em> (cash on invoice when sold). Amounts in the totals below match the table.</p>
  <table>
    <thead>
      <tr><th>Date</th><th>Dis</th><th>Due</th><th>Detail</th><th>Invoice</th><th style="text-align:right">Amount</th></tr>
    </thead>
    <tbody>
      ${
        rows.length
          ? rowHtml
          : `<tr><td colspan="6" style="color:#5a6b7a">No credit or payment lines yet.</td></tr>`
      }
    </tbody>
    <tfoot>
      <tr><td colspan="5">Total credit</td><td style="text-align:right">${escapeHtml(formatMoney(totalCredit))}</td></tr>
      <tr><td colspan="5">Total payments (sum of payment lines in table)</td><td style="text-align:right">${escapeHtml(
        formatMoney(totalPayments)
      )}</td></tr>
      <tr><td colspan="5">Balance (credit − payments on file)</td><td style="text-align:right">${escapeHtml(
        formatMoney(balance)
      )}</td></tr>
    </tfoot>
  </table>
</body>
</html>`;
}

export function downloadAccountReportWord(customer, rows, totals, company) {
  const html = buildAccountReportHtml(customer, rows, totals, company);
  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${safeFileSegment(customer.fullName)}-account-statement.doc`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function printAccountReportFromHtml(html) {
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

export function downloadAccountReportPdf(customer, rows, totals, company = DEFAULT_COMPANY) {
  const c = company || DEFAULT_COMPANY;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const m = 12;
  let y = m;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(customer.fullName, m, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const metaLines = [
    c.legalName,
    (c.addressLines || []).join(" · "),
    [c.phone ? `Phone: ${c.phone}` : null, c.email ? `Email: ${c.email}` : null].filter(Boolean).join(" · "),
    customer.phone ? `Customer phone: ${customer.phone}` : null,
    `Generated: ${new Date().toLocaleDateString()}`,
  ].filter((x) => x && String(x).trim().length);
  doc.text(metaLines, m, y);
  y += metaLines.length * 4 + 1;
  doc.setFontSize(8);
  const noteLines = doc.splitTextToSize(
    "All money lines in date order. Dis: Credit (amount put on account), Payment recorded (Add payment), At sale pay (cash on invoice when sold).",
    pageW - 2 * m
  );
  doc.text(noteLines, m, y);
  y += noteLines.length * 4 + 4;

  const col = [22, 30, 20, 88, 20, 28];
  const colX = [m];
  for (let i = 1; i < col.length; i++) colX.push(colX[i - 1] + col[i - 1]);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const headers = ["Date", "Dis", "Due", "Detail", "Invoice", "Amount"];
  headers.forEach((h, i) => {
    const x = colX[i];
    if (i === 5) doc.text(h, colX[i] + col[i] - 2, y, { align: "right" });
    else doc.text(h, x, y);
  });
  y += 4;
  doc.setDrawColor(212, 221, 230);
  doc.line(m, y, pageW - m, y);
  y += 3;
  doc.setFont("helvetica", "normal");

  const pageMax = 185;
  rows.forEach((r) => {
    const detailLines = doc.splitTextToSize(r.detail, col[3] - 2);
    const rowH = Math.max(6, detailLines.length * 3.5);
    if (y + rowH > pageMax) {
      doc.addPage();
      y = m;
    }
    doc.text(r.date, colX[0], y + 4);
    doc.text(r.dis, colX[1], y + 4);
    doc.text(r.due, colX[2], y + 4);
    doc.text(detailLines, colX[3], y + 4);
    const invText = r.invoiceNum != null ? `#${r.invoiceNum}` : "—";
    doc.text(invText, colX[4], y + 4);
    doc.text(formatMoney(r.amount), colX[5] + col[5] - 2, y + 4, { align: "right" });
    y += rowH + 1;
  });

  if (!rows.length) {
    if (y < pageMax) {
      doc.setFontSize(8);
      doc.setTextColor(90, 107, 122);
      doc.text("No credit or payment lines yet.", colX[0], y + 4);
      doc.setTextColor(0, 0, 0);
      y += 8;
    }
  }

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Total credit", colX[3], y);
  doc.text(formatMoney(totals.totalCredit), colX[5] + col[5] - 2, y, { align: "right" });
  y += 6;
  doc.text("Total payments (sum of payment lines in table)", colX[3], y);
  doc.text(formatMoney(totals.totalPayments), colX[5] + col[5] - 2, y, { align: "right" });
  y += 6;
  doc.text("Balance (credit − payments on file)", colX[3], y);
  doc.text(formatMoney(totals.balance), colX[5] + col[5] - 2, y, { align: "right" });

  doc.save(`${safeFileSegment(customer.fullName)}-account-statement.pdf`);
}
