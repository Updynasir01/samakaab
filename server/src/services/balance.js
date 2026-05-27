import CreditEntry from "../models/CreditEntry.js";
import PaymentEntry from "../models/PaymentEntry.js";
import Invoice from "../models/Invoice.js";

export const BALANCE_EPS = 0.005;

/** Payment rows that duplicate cash already counted via paidAtSale. */
export const EXCLUDED_PAYMENT_NOTE = /paid in full|payment at sale/i;

export function excludedPaymentNoteFilter() {
  return { note: { $not: EXCLUDED_PAYMENT_NOTE } };
}

/** Invoices fully paid at sale with no CreditEntry — paidAtSale counts toward balance payments. */
function paidAtSaleOnlyMatch(customerFilter) {
  return {
    ...customerFilter,
    creditAmount: { $lte: BALANCE_EPS },
    $or: [{ creditEntry: null }, { creditEntry: { $exists: false } }],
  };
}

/** Payments that reduce customer debt (exclude duplicate full-pay / at-sale entries). */
async function sumPaymentsForCustomer(customerId) {
  const [payRecorded, paidAtSaleNoCredit] = await Promise.all([
    PaymentEntry.aggregate([
      {
        $match: {
          customer: customerId,
          ...excludedPaymentNoteFilter(),
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Invoice.aggregate([
      { $match: paidAtSaleOnlyMatch({ customer: customerId }) },
      { $group: { _id: null, total: { $sum: "$paidAtSale" } } },
    ]),
  ]);
  return (payRecorded[0]?.total || 0) + (paidAtSaleNoCredit[0]?.total || 0);
}

async function sumPaymentsForCustomers(customerIds) {
  const [payRecorded, paidAtSaleNoCredit] = await Promise.all([
    PaymentEntry.aggregate([
      {
        $match: {
          customer: { $in: customerIds },
          ...excludedPaymentNoteFilter(),
        },
      },
      { $group: { _id: "$customer", total: { $sum: "$amount" } } },
    ]),
    Invoice.aggregate([
      { $match: paidAtSaleOnlyMatch({ customer: { $in: customerIds } }) },
      { $group: { _id: "$customer", total: { $sum: "$paidAtSale" } } },
    ]),
  ]);
  const payMap = new Map(payRecorded.map((p) => [String(p._id), p.total]));
  const atSaleMap = new Map(paidAtSaleNoCredit.map((p) => [String(p._id), p.total]));
  const out = new Map();
  for (const id of customerIds) {
    const sid = String(id);
    out.set(sid, (payMap.get(sid) || 0) + (atSaleMap.get(sid) || 0));
  }
  return out;
}

export async function getCustomerBalance(customerId) {
  const [creditAgg, totalPayments] = await Promise.all([
    CreditEntry.aggregate([
      { $match: { customer: customerId } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    sumPaymentsForCustomer(customerId),
  ]);
  const totalCredit = creditAgg[0]?.total || 0;
  return {
    totalCredit,
    totalPayments,
    balance: totalCredit - totalPayments,
  };
}

export async function getBalancesForCustomers(customerIds) {
  if (!customerIds.length) return new Map();
  const [credits, payMap] = await Promise.all([
    CreditEntry.aggregate([
      { $match: { customer: { $in: customerIds } } },
      { $group: { _id: "$customer", total: { $sum: "$amount" } } },
    ]),
    sumPaymentsForCustomers(customerIds),
  ]);
  const creditMap = new Map(credits.map((c) => [String(c._id), c.total]));
  const out = new Map();
  for (const id of customerIds) {
    const sid = String(id);
    const tc = creditMap.get(sid) || 0;
    const tp = payMap.get(sid) || 0;
    out.set(sid, { totalCredit: tc, totalPayments: tp, balance: tc - tp });
  }
  return out;
}

/** Sum of positive customer account balances (includes manual credits, not just invoices). */
export async function sumPositiveAccountBalances(customerIds) {
  const balances = await getBalancesForCustomers(customerIds);
  let total = 0;
  for (const b of balances.values()) {
    if (b.balance > BALANCE_EPS) total += b.balance;
  }
  return total;
}
