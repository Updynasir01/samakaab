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

function buildLedgerRows(rows) {
  const events = (rows || [])
    .map((r) => {
      const amount = Number(r.amount || 0);
      const isCredit = r.dis === "Credit";
      const invoiceRef = r.invoiceNum != null ? `INV-${r.invoiceNum}` : String(r.detail || r.dis || "—").toUpperCase();
      return {
        sortTime: Number(r.sortTime || 0),
        date: r.date || "—",
        dis: r.dis || "—",
        note: r.detail || "—",
        invoiceRef,
        amountDue: isCredit ? amount : 0,
        totalPaid: isCredit ? 0 : amount,
      };
    })
    .sort((a, b) => a.sortTime - b.sortTime);

  let runningOutstanding = 0;
  return events.map((e) => {
    runningOutstanding += e.amountDue - e.totalPaid;
    return { ...e, outstanding: Math.max(0, runningOutstanding) };
  });
}

/**
 * HTML for Word (.doc), print preview, same layout as PDF.
 * No "Account report" title — customer name + statement wording only.
 * @param {object} company - from useCompanyProfile().profile
 */
export function buildAccountReportHtml(customer, rows, { totalCredit, totalPayments, balance }, company = DEFAULT_COMPANY) {
  const c = company || DEFAULT_COMPANY;
  const today = new Date().toLocaleDateString();
  const ledgerRows = buildLedgerRows(rows);
  const rowHtml = ledgerRows
    .map(
      (r) => `<tr>
    <td>${escapeHtml(r.date)}</td>
    <td>${escapeHtml(r.dis)}</td>
    <td>${escapeHtml(r.note)}</td>
    <td>${escapeHtml(r.invoiceRef)}</td>
    <td class="amount">${r.amountDue ? escapeHtml(formatMoney(r.amountDue)) : ""}</td>
    <td class="amount">${r.totalPaid ? escapeHtml(formatMoney(r.totalPaid)) : ""}</td>
    <td class="amount">${escapeHtml(formatMoney(r.outstanding))}</td>
  </tr>`
    )
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(customer.fullName)} — statement</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, sans-serif; color: #1f2937; margin: 0; font-size: 10.5pt; }
  .wrap { padding: 8px 10px; }
  .topbar {
    display: grid; grid-template-columns: 1fr auto; gap: 10px;
    background: #f2f4f6; padding: 8px 10px; margin-bottom: 14px;
    font-weight: 700; color: #1b6484; letter-spacing: 0.3px;
  }
  .topbar .right { text-align: right; color: #2f4e61; }
  .topbar .date { display: block; color: #4b5563; font-size: 9pt; margin-top: 4px; font-weight: 600; }
  .meta {
    display: grid; grid-template-columns: 1fr 230px; gap: 14px; margin-bottom: 10px; align-items: start;
  }
  .meta .left { line-height: 1.5; font-size: 10.5pt; }
  .meta .left strong { display: inline-block; min-width: 74px; }
  .meta .right { font-size: 10pt; }
  .rightBoxRow {
    display: grid; grid-template-columns: 1fr auto; gap: 8px;
    background: #1d6c8f; color: #fff; padding: 4px 8px; font-weight: 700;
  }
  .rightValueRow {
    display: grid; grid-template-columns: 1fr auto; gap: 8px;
    border-bottom: 2px solid #9ca3af; padding: 3px 8px 4px;
  }
  .rightTotal {
    margin-top: 26px;
    display: grid; grid-template-columns: 1fr auto; gap: 8px;
    border-top: 2px solid #9ca3af; border-bottom: 2px solid #9ca3af; padding: 4px 8px; font-weight: 700; color: #2f4e61;
  }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td { border: 1px solid #c8d0d8; padding: 4px 7px; text-align: left; vertical-align: middle; font-size: 9.8pt; }
  th { background: #b9d8ea; color: #1f2937; font-weight: 700; }
  td.amount { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: #6b7280; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="topbar">
      <div>${escapeHtml(c.legalName)}</div>
      <div class="right">STATEMENT <span class="date">${escapeHtml(today)}</span></div>
    </div>

    <div class="meta">
      <div class="left">
        <div><strong>Customer:</strong> ${escapeHtml(customer.fullName)}</div>
        ${customer.address ? `<div><strong></strong> ${escapeHtml(customer.address)}</div>` : ""}
      </div>
      <div class="right">
        <div class="rightBoxRow"><span>Date</span><span>${escapeHtml(today)}</span></div>
        <div class="rightValueRow"><span>CURRENT</span><strong>${escapeHtml(formatMoney(balance))}</strong></div>
        <div class="rightTotal"><span>Total Outstanding:</span><span>${escapeHtml(formatMoney(balance))}</span></div>
      </div>
    </div>

    <table>
    <thead>
      <tr><th>Invoice Date</th><th>Dis</th><th>Note</th><th>Invoice #</th><th class="amount">Amount Due</th><th class="amount">Total Paid</th><th class="amount">Outstanding</th></tr>
    </thead>
    <tbody>
      ${
        ledgerRows.length
          ? rowHtml
          : `<tr><td colspan="7" class="muted">No statement lines yet.</td></tr>`
      }
    </tbody>
  </table>
  </div>
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
  const now = new Date().toLocaleDateString();
  const ledgerRows = buildLedgerRows(rows);

  doc.setFillColor(242, 244, 246);
  doc.rect(m, y - 5, pageW - m * 2, 12, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(27, 100, 132);
  doc.text(c.legalName, m + 2, y + 1);
  doc.text("STATEMENT", pageW - m - 2, y + 1, { align: "right" });
  doc.setFontSize(9);
  doc.setTextColor(75, 85, 99);
  doc.text(now, pageW - m - 2, y + 5, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Customer:", m, y);
  doc.text(customer.fullName, m + 20, y);
  doc.setFont("helvetica", "normal");

  const boxX = pageW - m - 66;
  doc.setFillColor(29, 108, 143);
  doc.rect(boxX, y - 7, 66, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Date", boxX + 2, y - 3);
  doc.text(now, boxX + 64, y - 3, { align: "right" });
  doc.setTextColor(0, 0, 0);
  doc.text("CURRENT", boxX + 2, y + 2);
  doc.text(formatMoney(totals.balance), boxX + 64, y + 2, { align: "right" });
  y += 12;

  const col = [25, 24, 56, 30, 24, 24, 28];
  const colX = [m];
  for (let i = 1; i < col.length; i++) colX.push(colX[i - 1] + col[i - 1]);

  doc.setFillColor(185, 216, 234);
  doc.rect(m, y - 4.5, col.reduce((a, b) => a + b, 0), 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const headers = ["Invoice Date", "Dis", "Note", "Invoice #", "Amount Due", "Total Paid", "Outstanding"];
  headers.forEach((h, i) => {
    const x = colX[i];
    if (i >= 4) doc.text(h, colX[i] + col[i] - 2, y, { align: "right" });
    else doc.text(h, x, y);
  });
  y += 3.5;
  doc.setDrawColor(212, 221, 230);
  doc.line(m, y, m + col.reduce((a, b) => a + b, 0), y);
  y += 3;
  doc.setFont("helvetica", "normal");

  const pageMax = 185;
  ledgerRows.forEach((r) => {
    if (y > pageMax) {
      doc.addPage();
      y = m;
    }
    doc.text(r.date, colX[0], y + 3.5);
    doc.text(r.dis, colX[1], y + 3.5);
    doc.text(doc.splitTextToSize(r.note, col[2] - 1), colX[2], y + 3.5);
    doc.text(r.invoiceRef, colX[3], y + 3.5);
    doc.text(r.amountDue ? formatMoney(r.amountDue) : "", colX[4] + col[4] - 2, y + 3.5, { align: "right" });
    doc.text(r.totalPaid ? formatMoney(r.totalPaid) : "", colX[5] + col[5] - 2, y + 3.5, { align: "right" });
    doc.text(formatMoney(r.outstanding), colX[6] + col[6] - 2, y + 3.5, { align: "right" });
    y += 5;
  });

  if (!ledgerRows.length) {
    if (y < pageMax) {
      doc.setFontSize(8);
      doc.setTextColor(90, 107, 122);
      doc.text("No statement lines yet.", colX[0], y + 4);
      doc.setTextColor(0, 0, 0);
      y += 8;
    }
  }

  doc.save(`${safeFileSegment(customer.fullName)}-account-statement.pdf`);
}
