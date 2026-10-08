import * as XLSX from "xlsx";
import { isSpreadsheetFile, parseMoneyCell } from "./parseInvoiceSpreadsheet.js";

const UNIT_ALIASES = {
  bottle: "bottle",
  bottles: "bottle",
  btl: "bottle",
  btls: "bottle",
  box: "box",
  boxes: "box",
  ctn: "box",
  ctns: "box",
  carton: "box",
  cartons: "box",
  kg: "kg",
  kgs: "kg",
  kilo: "kg",
  kilos: "kg",
  kilogram: "kg",
  kilograms: "kg",
  piece: "piece",
  pieces: "piece",
  pc: "piece",
  pcs: "piece",
  unit: "piece",
  each: "piece",
  ea: "piece",
};

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function normHeader(cell) {
  return String(cell ?? "")
    .trim()
    .toUpperCase()
    .replace(/#/g, "")
    .replace(/\s+/g, " ");
}

/** Map a spreadsheet unit cell onto bottle, box, kg, or piece. */
export function normalizeInventoryUnit(value) {
  const key = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
  return UNIT_ALIASES[key] || "";
}

function mapHeaderIndices(headerRow) {
  const idx = {};
  (headerRow || []).forEach((cell, i) => {
    const k = normHeader(cell);
    if (k === "DESCRIPTION" || k === "DESC" || k === "ITEM" || k === "PRODUCT" || k === "NAME") idx.description = i;
    else if (k === "QUANTITY" || k === "QTY" || k === "QTY.") idx.quantity = i;
    else if (k === "UNIT" || k === "UOM" || k === "UN") idx.unit = i;
    else if (
      k === "PRICE" ||
      k === "UNIT PRICE" ||
      k === "RATE" ||
      k === "UNITPRICE" ||
      k === "COST" ||
      k === "UNIT COST"
    ) {
      idx.unitCost = i;
    } else if (k === "TOTAL" || k === "LINE TOTAL" || k === "AMOUNT" || k === "SUBTOTAL") idx.lineTotal = i;
  });
  return idx;
}

function findHeaderRowIndex(matrix) {
  for (let r = 0; r < Math.min(matrix.length, 40); r++) {
    const mapped = mapHeaderIndices(matrix[r] || []);
    if (mapped.description != null && mapped.quantity != null) return r;
  }
  return -1;
}

function parseQty(raw) {
  if (raw === "" || raw == null) return NaN;
  if (typeof raw === "number" && Number.isFinite(raw)) return round2(raw);
  const parsed = parseMoneyCell(raw);
  if (Number.isFinite(parsed)) return parsed;
  const n = parseFloat(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? round2(n) : NaN;
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @param {string} [fileName]
 * @returns {{ lines: Array<{description:string,quantity:number,unit:string,unitCost:number}>, warnings: string[], skippedRows: number }}
 */
export function parseInventorySpreadsheet(arrayBuffer, fileName = "") {
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
      "Could not find a header row with DESCRIPTION and QUANTITY. Use columns: DESCRIPTION, QUANTITY, UNIT, PRICE."
    );
  }

  const col = mapHeaderIndices(matrix[headerRowIdx]);
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

    const qty = parseQty(col.quantity != null ? row[col.quantity] : "");
    if (!Number.isFinite(qty) || qty <= 0) {
      warnings.push(`Row ${r + 1} (“${desc.slice(0, 40)}”): invalid quantity — skipped.`);
      skippedRows++;
      continue;
    }

    const unit = normalizeInventoryUnit(col.unit != null ? row[col.unit] : "");
    if (!unit) {
      const shown = col.unit != null ? String(row[col.unit] ?? "").trim() : "";
      warnings.push(
        `Row ${r + 1} (“${desc.slice(0, 40)}”): unit “${shown || "blank"}” is not bottle, box, kg, or piece — skipped.`
      );
      skippedRows++;
      continue;
    }

    let unitCost = col.unitCost != null ? parseMoneyCell(row[col.unitCost]) : NaN;
    const lineTotalCell = col.lineTotal != null ? parseMoneyCell(row[col.lineTotal]) : NaN;
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      if (Number.isFinite(lineTotalCell) && lineTotalCell >= 0 && qty > 0) {
        unitCost = round2(lineTotalCell / qty);
        warnings.push(`Row ${r + 1}: PRICE missing — derived from TOTAL ÷ quantity.`);
      } else {
        unitCost = 0;
        warnings.push(`Row ${r + 1} (“${desc.slice(0, 40)}”): no PRICE — cost saved as 0.`);
      }
    }

    lines.push({
      description: desc,
      quantity: qty,
      unit,
      unitCost,
    });
  }

  if (lines.length === 0) {
    throw new Error("No valid stock rows found. Check DESCRIPTION, QUANTITY, and UNIT (bottle, box, kg, or piece).");
  }

  return { lines, warnings, skippedRows };
}

export function parseInventoryFile(file) {
  if (!isSpreadsheetFile(file)) {
    return Promise.reject(
      new Error("Please choose an Excel file (.xlsx, .xls) or CSV. Other file types are not supported.")
    );
  }
  return file.arrayBuffer().then((buf) => parseInventorySpreadsheet(buf, file.name));
}

export function downloadInventoryTemplateXlsx() {
  const aoa = [
    ["#", "DESCRIPTION", "QUANTITY", "UNIT", "PRICE", "TOTAL"],
    [1, "MILK", 120, "box", 16, 1920],
    [2, "COOKING OIL", 24, "bottle", 8, 192],
    [3, "SUGAR", 50, "kg", 1.2, 60],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Stock");
  XLSX.writeFile(wb, "inventory-stock-template.xlsx");
}
