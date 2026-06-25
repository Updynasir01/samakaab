import Customer from "../models/Customer.js";
import Invoice from "../models/Invoice.js";
import CreditEntry from "../models/CreditEntry.js";
import PaymentEntry from "../models/PaymentEntry.js";
import AppSettings from "../models/AppSettings.js";
import User from "../models/User.js";

const BACKUP_VERSION = 1;

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvLine(cells) {
  return cells.map(csvEscape).join(",");
}

function toIso(d) {
  if (!d) return "";
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? "" : x.toISOString();
}

export async function buildBackupPayload() {
  const [customers, invoices, credits, payments, companySettings, users] = await Promise.all([
    Customer.find().sort({ fullName: 1 }).lean(),
    Invoice.find().sort({ date: -1, invoiceNumber: -1 }).lean(),
    CreditEntry.find().sort({ dateOfCredit: -1 }).lean(),
    PaymentEntry.find().sort({ paidAt: -1 }).lean(),
    AppSettings.find().lean(),
    User.find().select("username role createdAt updatedAt").sort({ username: 1 }).lean(),
  ]);

  const customerMap = new Map(customers.map((c) => [String(c._id), c.fullName]));

  const exportedAt = new Date().toISOString();

  return {
    meta: {
      app: "Samakaab Supermarket",
      backupVersion: BACKUP_VERSION,
      exportedAt,
      counts: {
        customers: customers.length,
        invoices: invoices.length,
        credits: credits.length,
        payments: payments.length,
        users: users.length,
      },
      note: "Full financial backup. User passwords are not included — recreate or reset after restore.",
    },
    companySettings,
    customers,
    invoices,
    credits,
    payments,
    users: users.map((u) => ({
      id: u._id,
      username: u.username,
      role: u.role,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    })),
    csv: buildCsvBundle({ customers, invoices, credits, payments, customerMap }),
  };
}

function buildCsvBundle({ customers, invoices, credits, payments, customerMap }) {
  const customersCsv = [
    csvLine(["id", "fullName", "phone", "address", "notes", "createdAt"]),
    ...customers.map((c) =>
      csvLine([c._id, c.fullName, c.phone, c.address, c.notes, toIso(c.createdAt)])
    ),
  ].join("\r\n");

  const invoicesCsv = [
    csvLine([
      "id",
      "invoiceNumber",
      "orderNumber",
      "customerId",
      "customerName",
      "date",
      "total",
      "paidAtSale",
      "creditAmount",
      "paymentStatus",
      "note",
      "createdBy",
    ]),
    ...invoices.map((inv) =>
      csvLine([
        inv._id,
        inv.invoiceNumber,
        inv.orderNumber,
        inv.customer,
        inv.customer ? customerMap.get(String(inv.customer)) || "" : "Walk-in",
        toIso(inv.date),
        inv.total,
        inv.paidAtSale,
        inv.creditAmount,
        inv.paymentStatus,
        inv.note,
        inv.createdBy,
      ])
    ),
  ].join("\r\n");

  const creditsCsv = [
    csvLine(["id", "customerId", "customerName", "amount", "description", "dateOfCredit", "expectedPayDate", "invoiceId", "createdBy"]),
    ...credits.map((cr) =>
      csvLine([
        cr._id,
        cr.customer,
        customerMap.get(String(cr.customer)) || "",
        cr.amount,
        cr.description,
        toIso(cr.dateOfCredit),
        toIso(cr.expectedPayDate),
        cr.invoice || "",
        cr.createdBy,
      ])
    ),
  ].join("\r\n");

  const paymentsCsv = [
    csvLine(["id", "customerId", "customerName", "amount", "paidAt", "note", "invoiceId", "createdBy"]),
    ...payments.map((p) =>
      csvLine([
        p._id,
        p.customer,
        customerMap.get(String(p.customer)) || "",
        p.amount,
        toIso(p.paidAt),
        p.note,
        p.invoice || "",
        p.createdBy,
      ])
    ),
  ].join("\r\n");

  return {
    customers: customersCsv,
    invoices: invoicesCsv,
    credits: creditsCsv,
    payments: paymentsCsv,
  };
}
