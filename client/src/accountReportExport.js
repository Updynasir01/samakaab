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

function statementFileSuffix(filters = {}) {
  const bits = [];
  if (filters.year && filters.month) {
    bits.push(`${filters.year}-${String(filters.month).padStart(2, "0")}`);
  }
  if (filters.invoiceStatus && filters.invoiceStatus !== "all") {
    bits.push(filters.invoiceStatus);
  }
  return bits.length ? `-${bits.join("-")}` : "";
}

/** Keep rows for a month (by transaction date) and/or paid vs unpaid invoices. */
export function filterAccountStatementRows(rows, invoices, { year, month, invoiceStatus = "all" } = {}) {
  const invById = new Map(invoices.map((i) => [String(i._id), i]));

  function linkedInvoice(row) {
    if (!row.invoiceId) return null;
    return invById.get(String(row.invoiceId)) ?? null;
  }

  function inMonth(row) {
    if (!year || !month) return true;
    const d = new Date(row.date);
    return !Number.isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() + 1 === month;
  }

  function matchesStatus(row) {
    if (invoiceStatus === "all") return true;
    const inv = linkedInvoice(row);
    if (!inv) {
      if (row.dis === "Credit") return invoiceStatus === "unpaid";
      return false;
    }
    const paid = inv.paymentStatus === "paid";
    return invoiceStatus === "paid" ? paid : !paid;
  }

  return (rows || []).filter((r) => inMonth(r) && matchesStatus(r));
}

export function computeStatementOpeningBalance(allRows, year, month) {
  if (!year || !month) return 0;
  const start = new Date(year, month - 1, 1).getTime();
  let bal = 0;
  const sorted = [...(allRows || [])].sort((a, b) => (a.sortTime || 0) - (b.sortTime || 0));
  for (const r of sorted) {
    if ((r.sortTime || 0) >= start) break;
    bal += r.dis === "Credit" ? Number(r.amount || 0) : -Number(r.amount || 0);
  }
  return Math.max(0, bal);
}

export function buildStatementPeriodLabel({ year, month, invoiceStatus = "all" } = {}) {
  const parts = [];
  if (year && month) {
    parts.push(new Date(year, month - 1, 1).toLocaleString("default", { month: "long", year: "numeric" }));
  }
  if (invoiceStatus === "paid") parts.push("paid invoices only");
  if (invoiceStatus === "unpaid") parts.push("unpaid invoices only");
  return parts.length ? parts.join(" — ") : "All activity";
}

export function prepareAccountStatement(allRows, invoices, filters, customerBalance) {
  const filtered = filterAccountStatementRows(allRows, invoices, filters);
  const openingBalance = computeStatementOpeningBalance(allRows, filters.year, filters.month);
  const isFiltered = Boolean((filters.year && filters.month) || filters.invoiceStatus !== "all");

  const totalCredit = filtered
    .filter((r) => r.dis === "Credit")
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalPayments = filtered
    .filter((r) => r.dis !== "Credit")
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const ledgerRows = buildLedgerRows(filtered, isFiltered ? null : customerBalance, { openingBalance });
  const balance = isFiltered
    ? ledgerRows.length
      ? ledgerRows[ledgerRows.length - 1].outstanding
      : openingBalance
    : Number(customerBalance ?? 0);

  return {
    rows: filtered,
    totals: { totalCredit, totalPayments, balance, openingBalance },
    exportOptions: {
      periodLabel: buildStatementPeriodLabel(filters),
      openingBalance,
      filters,
    },
  };
}

function buildLedgerRows(rows, finalBalance, { openingBalance = 0 } = {}) {
  const events = (rows || [])
    .map((r) => {
      const amount = Number(r.amount || 0);
      const isCredit = r.dis === "Credit";
      const invoiceRef = r.invoiceNum != null ? `INV-${r.invoiceNum}` : String(r.detail || r.dis || "—").toUpperCase();
      return {
        sortTime: Number(r.sortTime || 0),
        date: r.date || "—",
        dis: r.dis || "—",
        invoiceRef,
        orderNumber: String(r.orderNumber || "").trim(),
        amountDue: isCredit ? amount : 0,
        totalPaid: isCredit ? 0 : amount,
      };
    })
    .sort((a, b) => a.sortTime - b.sortTime);

  let runningOutstanding = Math.max(0, openingBalance);
  const ledger = events.map((e) => {
    runningOutstanding += e.amountDue - e.totalPaid;
    return { ...e, outstanding: Math.max(0, runningOutstanding) };
  });

  if (
    ledger.length &&
    finalBalance != null &&
    !Number.isNaN(Number(finalBalance)) &&
    openingBalance === 0
  ) {
    ledger[ledger.length - 1].outstanding = Math.max(0, Number(finalBalance));
  }
  return ledger;
}

/**
 * HTML for Word (.doc), print preview, same layout as PDF.
 * No "Account report" title — customer name + statement wording only.
 * @param {object} company - from useCompanyProfile().profile
 * @param {object} [exportOptions] - periodLabel, openingBalance
 */
export function buildAccountReportHtml(
  customer,
  rows,
  { totalCredit, totalPayments, balance, openingBalance },
  company = DEFAULT_COMPANY,
  exportOptions = {}
) {
  const c = company || DEFAULT_COMPANY;
  const today = new Date().toLocaleDateString();
  const periodLabel = exportOptions.periodLabel || "";
  const opening = exportOptions.openingBalance ?? openingBalance ?? 0;
  const ledgerRows = buildLedgerRows(rows, balance, { openingBalance: opening });
  const rowHtml = ledgerRows
    .map(
      (r) => `<tr>
    <td class="col-date">${escapeHtml(r.date)}</td>
    <td class="col-dis">${escapeHtml(r.dis)}</td>
    <td class="col-inv">${escapeHtml(r.invoiceRef)}</td>
    <td class="col-order">${escapeHtml(r.orderNumber || "—")}</td>
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
  table.ledger { border-collapse: collapse; width: 100%; margin-top: 8px; table-layout: fixed; }
  table.ledger th, table.ledger td { border: 1px solid #c8d0d8; padding: 4px 6px; text-align: left; vertical-align: top; font-size: 9.5pt; }
  table.ledger th { background: #b9d8ea; color: #1f2937; font-weight: 700; }
  table.ledger td.col-date, table.ledger th.col-date { white-space: nowrap; }
  table.ledger td.col-dis, table.ledger th.col-dis { white-space: nowrap; }
  table.ledger td.col-inv, table.ledger th.col-inv { white-space: nowrap; }
  table.ledger td.col-order, table.ledger th.col-order { white-space: nowrap; }
  table.ledger td.amount, table.ledger th.amount { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
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
        ${periodLabel ? `<div><strong>Period:</strong> ${escapeHtml(periodLabel)}</div>` : ""}
        ${opening > 0 ? `<div><strong>Opening balance:</strong> ${escapeHtml(formatMoney(opening))}</div>` : ""}
        ${customer.address ? `<div><strong></strong> ${escapeHtml(customer.address)}</div>` : ""}
      </div>
      <div class="right">
        <div class="rightBoxRow"><span>Date</span><span>${escapeHtml(today)}</span></div>
        <div class="rightValueRow"><span>CURRENT</span><strong>${escapeHtml(formatMoney(balance))}</strong></div>
        <div class="rightValueRow"><span>Total credit</span><span>${escapeHtml(formatMoney(totalCredit))}</span></div>
        <div class="rightValueRow"><span>Total paid</span><span>${escapeHtml(formatMoney(totalPayments))}</span></div>
        <div class="rightTotal"><span>Total Outstanding:</span><span>${escapeHtml(formatMoney(balance))}</span></div>
      </div>
    </div>

    <table class="ledger">
    <colgroup>
      <col style="width: 96px" />
      <col style="width: 108px" />
      <col style="width: 76px" />
      <col style="width: 72px" />
      <col style="width: 88px" />
      <col style="width: 88px" />
      <col style="width: 96px" />
    </colgroup>
    <thead>
      <tr><th class="col-date">Invoice Date</th><th class="col-dis">Dis</th><th class="col-inv">Invoice #</th><th class="col-order">Order No</th><th class="amount">Amount Due</th><th class="amount">Total Paid</th><th class="amount">Outstanding</th></tr>
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

export function downloadAccountReportWord(customer, rows, totals, company, exportOptions = {}) {
  const html = buildAccountReportHtml(customer, rows, totals, company, exportOptions);
  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${safeFileSegment(customer.fullName)}-account-statement${statementFileSuffix(exportOptions.filters)}.doc`;
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

export function downloadAccountReportPdf(customer, rows, totals, company = DEFAULT_COMPANY, exportOptions = {}) {
  const c = company || DEFAULT_COMPANY;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const m = 12;
  let y = m;
  const now = new Date().toLocaleDateString();
  const periodLabel = exportOptions.periodLabel || "";
  const opening = exportOptions.openingBalance ?? totals.openingBalance ?? 0;
  const ledgerRows = buildLedgerRows(rows, totals.balance, { openingBalance: opening });

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
  y += 5;
  if (periodLabel) {
    doc.setFont("helvetica", "bold");
    doc.text("Period:", m, y);
    doc.setFont("helvetica", "normal");
    doc.text(periodLabel, m + 20, y);
    y += 5;
  }
  if (opening > 0) {
    doc.setFont("helvetica", "bold");
    doc.text("Opening:", m, y);
    doc.setFont("helvetica", "normal");
    doc.text(formatMoney(opening), m + 20, y);
    y += 5;
  }
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

  const col = [30, 26, 24, 22, 24, 24, 28];
  const colX = [m];
  for (let i = 1; i < col.length; i++) colX.push(colX[i - 1] + col[i - 1]);

  doc.setFillColor(185, 216, 234);
  doc.rect(m, y - 4.5, col.reduce((a, b) => a + b, 0), 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const headers = ["Invoice Date", "Dis", "Invoice #", "Order No", "Amount Due", "Total Paid", "Outstanding"];
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
    doc.text(r.date, colX[0], y + 3.5, { maxWidth: col[0] - 1 });
    doc.text(r.dis, colX[1], y + 3.5, { maxWidth: col[1] - 1 });
    doc.text(r.invoiceRef, colX[2], y + 3.5);
    doc.text(r.orderNumber || "—", colX[3], y + 3.5, { maxWidth: col[3] - 1 });
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

  doc.save(`${safeFileSegment(customer.fullName)}-account-statement${statementFileSuffix(exportOptions.filters)}.pdf`);
}
