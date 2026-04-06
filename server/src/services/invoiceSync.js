import Invoice from "../models/Invoice.js";
import PaymentEntry from "../models/PaymentEntry.js";
import CreditEntry from "../models/CreditEntry.js";
import { getCustomerBalance } from "./balance.js";

const EPS = 0.005;

const PAYMENT_AT_SALE_NOTE = /payment at sale/i;

/**
 * When total credit − total payments ≤ 0, mark all unpaid/partial invoices as paid
 * so dashboard / debtors match the real account balance.
 */
export async function closeInvoicesWhenAccountSettled(customerId) {
  const { balance } = await getCustomerBalance(customerId);
  if (balance > EPS) return;
  await Invoice.updateMany(
    { customer: customerId, paymentStatus: { $in: ["unpaid", "partial"] } },
    { $set: { paymentStatus: "paid", creditAmount: 0 } }
  );
}

/** One-time / maintenance: close invoices for any customer whose balance is already zero. */
export async function syncAllInvoiceStatuses() {
  const ids = await Invoice.distinct("customer", {
    paymentStatus: { $in: ["unpaid", "partial"] },
    customer: { $exists: true, $ne: null },
  });
  for (const id of ids) {
    await closeInvoicesWhenAccountSettled(id);
  }
  return { openInvoiceCustomersChecked: ids.length };
}

/**
 * Removes PaymentEntry rows that duplicated invoice paidAtSale for partial credit sales.
 * Those entries made balance ≤ 0 and closed invoices while CreditEntry still showed debt.
 * Then restores invoice.creditAmount / paymentStatus from CreditEntry when wrongly closed.
 */
export async function repairPartialPaymentDoubleCount() {
  const candidates = await PaymentEntry.find({ invoice: { $exists: true, $ne: null } }).lean();
  let removed = 0;
  const invoiceIdsToRestore = new Set();

  for (const p of candidates) {
    if (!PAYMENT_AT_SALE_NOTE.test(p.note || "")) continue;
    const inv = await Invoice.findById(p.invoice).lean();
    if (!inv?.creditEntry) continue;
    const cr = await CreditEntry.findById(inv.creditEntry).lean();
    if (!cr || cr.amount <= EPS) continue;
    if (Math.abs(Number(p.amount) - Number(inv.paidAtSale || 0)) > EPS) continue;
    await PaymentEntry.deleteOne({ _id: p._id });
    removed += 1;
    invoiceIdsToRestore.add(String(inv._id));
  }

  let invoicesRestored = 0;
  for (const invId of invoiceIdsToRestore) {
    const inv = await Invoice.findById(invId).lean();
    if (!inv?.creditEntry) continue;
    const cr = await CreditEntry.findById(inv.creditEntry).lean();
    if (!cr || cr.amount <= EPS) continue;
    const paidAtSale = Number(inv.paidAtSale || 0);
    await Invoice.updateOne(
      { _id: inv._id },
      {
        $set: {
          creditAmount: cr.amount,
          paymentStatus: paidAtSale > EPS ? "partial" : "unpaid",
        },
      }
    );
    invoicesRestored += 1;
  }

  return { paymentEntriesRemoved: removed, invoicesRestored };
}
