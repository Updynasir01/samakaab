import Invoice from "../models/Invoice.js";
import PaymentEntry from "../models/PaymentEntry.js";
import CreditEntry from "../models/CreditEntry.js";
import { BALANCE_EPS, EXCLUDED_PAYMENT_NOTE } from "./balance.js";

const EPS = BALANCE_EPS;

const PAYMENT_AT_SALE_NOTE = /payment at sale/i;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function originalCreditForInvoice(inv, creditMap) {
  if (inv.creditEntry) {
    const cr = creditMap.get(String(inv.creditEntry));
    return Number(cr?.amount || 0);
  }
  return Math.max(0, round2(Number(inv.total) - Number(inv.paidAtSale || 0)));
}

function paymentStatusFor(remaining, paidAtSale, original) {
  if (remaining <= EPS) return "paid";
  const paidTowardCredit = original - remaining;
  if (paidAtSale > EPS || paidTowardCredit > EPS) return "partial";
  return "unpaid";
}

/**
 * Reconcile each invoice's remaining credit and status from:
 * - original credit (CreditEntry or total − paidAtSale)
 * - payments linked to that invoice
 * - unlinked customer payments applied oldest-invoice-first (FIFO)
 *
 * CreditEntry amounts are left unchanged so customer balance (credits − payments) stays correct.
 */
export async function syncCustomerInvoices(customerId) {
  const invoices = await Invoice.find({ customer: customerId })
    .sort({ date: 1, invoiceNumber: 1 })
    .lean();

  if (!invoices.length) return { updated: 0 };

  const creditIds = invoices.map((i) => i.creditEntry).filter(Boolean);
  const credits = creditIds.length
    ? await CreditEntry.find({ _id: { $in: creditIds } }).lean()
    : [];
  const creditMap = new Map(credits.map((c) => [String(c._id), c]));

  const payments = await PaymentEntry.find({ customer: customerId })
    .sort({ paidAt: 1, _id: 1 })
    .lean();

  const linkedByInv = new Map();
  let unlinkedPool = 0;
  for (const p of payments) {
    if (EXCLUDED_PAYMENT_NOTE.test(p.note || "")) continue;
    const amt = Number(p.amount || 0);
    if (p.invoice) {
      const k = String(p.invoice);
      linkedByInv.set(k, (linkedByInv.get(k) || 0) + amt);
    } else {
      unlinkedPool += amt;
    }
  }

  const withCredit = [];
  for (const inv of invoices) {
    const original = originalCreditForInvoice(inv, creditMap);
    if (original <= EPS) {
      if (inv.paymentStatus !== "paid" || Number(inv.creditAmount || 0) > EPS) {
        await Invoice.updateOne({ _id: inv._id }, { $set: { paymentStatus: "paid", creditAmount: 0 } });
      }
      continue;
    }
    const linked = linkedByInv.get(String(inv._id)) || 0;
    const afterLinked = Math.max(0, round2(original - linked));
    withCredit.push({ inv, original, afterLinked });
  }

  for (const row of withCredit) {
    const applied = Math.min(unlinkedPool, row.afterLinked);
    row.remaining = round2(Math.max(0, row.afterLinked - applied));
    unlinkedPool = round2(Math.max(0, unlinkedPool - applied));
  }

  let updated = 0;
  for (const row of withCredit) {
    const { inv, original, remaining } = row;
    const paidAtSale = Number(inv.paidAtSale || 0);
    const paymentStatus = paymentStatusFor(remaining, paidAtSale, original);
    const creditAmount = remaining > EPS ? remaining : 0;

    const curCredit = round2(Number(inv.creditAmount || 0));
    const curStatus = inv.paymentStatus;
    if (Math.abs(curCredit - creditAmount) > EPS || curStatus !== paymentStatus) {
      await Invoice.updateOne({ _id: inv._id }, { $set: { creditAmount, paymentStatus } });
      updated += 1;
    }
  }

  return { updated };
}

/** Sync customers who may still have open invoice debt or unallocated payments. */
export async function syncCustomersWithOpenDebt() {
  const [openCustomers, paymentCustomers] = await Promise.all([
    Invoice.distinct("customer", {
      customer: { $exists: true, $ne: null },
      paymentStatus: { $in: ["unpaid", "partial"] },
    }),
    PaymentEntry.distinct("customer"),
  ]);
  const ids = [...new Set([...openCustomers, ...paymentCustomers].filter(Boolean).map(String))];
  for (const cid of ids) {
    await syncCustomerInvoices(cid);
  }
  return { customersSynced: ids.length };
}

/** @deprecated Use syncCustomerInvoices — kept as alias for existing callers. */
export async function closeInvoicesWhenAccountSettled(customerId) {
  return syncCustomerInvoices(customerId);
}

/** One-time / maintenance: reconcile all customers that have invoices or payments. */
export async function syncAllInvoiceStatuses() {
  const [fromInvoices, fromPayments] = await Promise.all([
    Invoice.distinct("customer", { customer: { $exists: true, $ne: null } }),
    PaymentEntry.distinct("customer"),
  ]);
  const ids = [...new Set([...fromInvoices, ...fromPayments].filter(Boolean).map(String))];
  for (const cid of ids) {
    await syncCustomerInvoices(cid);
  }
  return { customersSynced: ids.length };
}

/**
 * Removes PaymentEntry rows that duplicated invoice paidAtSale for partial credit sales.
 * Those entries made balance ≤ 0 and closed invoices while CreditEntry still showed debt.
 */
export async function repairPartialPaymentDoubleCount() {
  const candidates = await PaymentEntry.find({ invoice: { $exists: true, $ne: null } }).lean();
  let removed = 0;
  const customerIds = new Set();

  for (const p of candidates) {
    if (!PAYMENT_AT_SALE_NOTE.test(p.note || "")) continue;
    const inv = await Invoice.findById(p.invoice).lean();
    if (!inv?.creditEntry) continue;
    const cr = await CreditEntry.findById(inv.creditEntry).lean();
    if (!cr || cr.amount <= EPS) continue;
    if (Math.abs(Number(p.amount) - Number(inv.paidAtSale || 0)) > EPS) continue;
    await PaymentEntry.deleteOne({ _id: p._id });
    removed += 1;
    if (inv.customer) customerIds.add(String(inv.customer));
  }

  for (const cid of customerIds) {
    await syncCustomerInvoices(cid);
  }

  return { paymentEntriesRemoved: removed, customersResynced: customerIds.size };
}
