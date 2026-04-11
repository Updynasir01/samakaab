import * as XLSX from "xlsx";

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Strip $, commas, spaces from money cells */
export function parseMoneyCell(v) {
  if (v == null || v === "") return NaN;
  if (typeof v === "number" && Number.isFinite(v)) return round2(v);
  const s = String(v).replace(/[$,\s\u00a0]/g, "").replace(/[^\d.-]/g, "");
  if (s === "" || s === "-") return NaN;
  const n = parseFloat(s);
  return Number.isFinite(n) ? round2(n) : NaN;
}

function normHeader(cell) {
  return String(cell ?? "")
    .trim()
    .toUpperCase()
    .replace(/#/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Map header row cells to column indices.
 * Expected columns (like your Excel): #, DESCRIPTION, QUANTITY, UNIT, PRICE, TOTAL
 */
function mapHeaderIndices(headerRow) {
  const idx = {};
  (headerRow || []).forEach((cell, i) => {
    const k = normHeader(cell);
    if (k === "DESCRIPTION" || k === "DESC" || k === "ITEM" || k === "PRODUCT") idx.description = i;
    else if (k === "QUANTITY" || k === "QTY" || k === "QTY." || k === "QTY ") idx.quantity = i;
    else if (k === "UNIT" || k === "UOM" || k === "UN") idx.unit = i;
    else if (k === "PRICE" || k === "UNIT PRICE" || k === "RATE" || k === "UNITPRICE") idx.unitPrice = i;
    else if (k === "TOTAL" || k === "LINE TOTAL" || k === "AMOUNT" || k === "SUBTOTAL") idx.lineTotal = i;
    else if (k === "" || k === "NO" || k === "N" || k === "#") idx.rowNum = i;
  });
  return idx;
}

function findHeaderRowIndex(matrix) {
  for (let r = 0; r < Math.min(matrix.length, 40); r++) {
    const row = matrix[r] || [];
    const mapped = mapHeaderIndices(row);
    if (mapped.description != null && (mapped.quantity != null || mapped.unitPrice != null)) {
      return r;
    }
  }
  return -1;
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @param {string} [fileName]
 * @returns {{ lines: Array<{description:string,quantity:number,unit:string,unitPrice:number}>, warnings: string[], skippedRows: number }}
 */
export function parseInvoiceSpreadsheet(arrayBuffer, fileName = "") {
  const isCsv = /\.csv$/i.test(fileName);
  const wb = XLSX.read(arrayBuffer, {
    type: "array",
    cellDates: true,
    raw: false,
    ...(isCsv ? { FS: ",", RS: "\n" } : {}),
  });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });

  const headerRowIdx = findHeaderRowIndex(matrix);
  if (headerRowIdx < 0) {
    throw new Error(
      'Could not find a header row with DESCRIPTION and QUANTITY (or PRICE). Use columns: #, DESCRIPTION, QUANTITY, UNIT, PRICE, TOTAL.'
    );
  }

  const col = mapHeaderIndices(matrix[headerRowIdx]);
  if (col.description == null) {
    throw new Error("Spreadsheet must include a DESCRIPTION column.");
  }

  const lines = [];
  const warnings = [];
  let skippedRows = 0;
  let emptyStreak = 0;

  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const desc = String(row[col.description] ?? "").trim();
    if (!desc) {
      emptyStreak++;
      if (emptyStreak >= 5) break;
      continue;
    }
    emptyStreak = 0;

    const qtyRaw = col.quantity != null ? row[col.quantity] : "";
    let qty = NaN;
    if (qtyRaw === "" || qtyRaw == null) qty = NaN;
    else if (typeof qtyRaw === "number" && Number.isFinite(qtyRaw)) qty = round2(qtyRaw);
    else {
      const parsed = parseMoneyCell(qtyRaw);
      qty = Number.isFinite(parsed) ? parsed : round2(parseFloat(String(qtyRaw).replace(/,/g, "")));
    }
    const unit = col.unit != null ? String(row[col.unit] ?? "").trim() : "";

    let unitPrice = col.unitPrice != null ? parseMoneyCell(row[col.unitPrice]) : NaN;
    const lineTotalCell = col.lineTotal != null ? parseMoneyCell(row[col.lineTotal]) : NaN;

    if (!Number.isFinite(qty) || qty < 0) {
      warnings.push(`Row ${r + 1} (“${desc.slice(0, 40)}…”): invalid quantity — skipped.`);
      skippedRows++;
      continue;
    }
    if (qty === 0) {
      skippedRows++;
      continue;
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      if (Number.isFinite(lineTotalCell) && lineTotalCell >= 0 && qty > 0) {
        unitPrice = round2(lineTotalCell / qty);
        warnings.push(`Row ${r + 1}: PRICE missing — derived from TOTAL ÷ quantity.`);
      } else {
        warnings.push(`Row ${r + 1} (“${desc.slice(0, 40)}…”): missing PRICE — skipped.`);
        skippedRows++;
        continue;
      }
    }

    const computedTotal = round2(qty * unitPrice);
    if (Number.isFinite(lineTotalCell) && Math.abs(lineTotalCell - computedTotal) > 0.02) {
      warnings.push(
        `Row ${r + 1}: TOTAL (${lineTotalCell}) ≠ quantity × PRICE (${computedTotal}); using quantity × PRICE.`
      );
    }

    lines.push({
      description: desc,
      quantity: qty,
      unit,
      unitPrice,
    });
  }

  if (lines.length === 0) {
    throw new Error("No valid line items found. Check DESCRIPTION, QUANTITY, and PRICE columns.");
  }

  return { lines, warnings, skippedRows };
}

export function parseInvoiceFile(file) {
  return file.arrayBuffer().then((buf) => parseInvoiceSpreadsheet(buf, file.name));
}

/** Download a starter .xlsx matching your standard columns */
export function downloadInvoiceTemplateXlsx() {
  const aoa = [
    ["#", "DESCRIPTION", "QUANTITY", "UNIT", "PRICE", "TOTAL"],
    [1, "MILK", 120, "BOX", 16, 1920],
    [2, "MILK POWDER", 6, "CTN", 120, 720],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Invoice");
  XLSX.writeFile(wb, "invoice-line-items-template.xlsx");
}
