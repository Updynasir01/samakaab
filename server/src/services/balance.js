import CreditEntry from "../models/CreditEntry.js";
import PaymentEntry from "../models/PaymentEntry.js";

export async function getCustomerBalance(customerId) {
  const [creditAgg, payAgg] = await Promise.all([
    CreditEntry.aggregate([
      { $match: { customer: customerId } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    PaymentEntry.aggregate([
      { $match: { customer: customerId } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);
  const totalCredit = creditAgg[0]?.total || 0;
  const totalPayments = payAgg[0]?.total || 0;
  return {
    totalCredit,
    totalPayments,
    balance: totalCredit - totalPayments,
  };
}

export async function getBalancesForCustomers(customerIds) {
  if (!customerIds.length) return new Map();
  const [credits, payments] = await Promise.all([
    CreditEntry.aggregate([
      { $match: { customer: { $in: customerIds } } },
      { $group: { _id: "$customer", total: { $sum: "$amount" } } },
    ]),
    PaymentEntry.aggregate([
      { $match: { customer: { $in: customerIds } } },
      { $group: { _id: "$customer", total: { $sum: "$amount" } } },
    ]),
  ]);
  const creditMap = new Map(credits.map((c) => [String(c._id), c.total]));
  const payMap = new Map(payments.map((p) => [String(p._id), p.total]));
  const out = new Map();
  for (const id of customerIds) {
    const sid = String(id);
    const tc = creditMap.get(sid) || 0;
    const tp = payMap.get(sid) || 0;
    out.set(sid, { totalCredit: tc, totalPayments: tp, balance: tc - tp });
  }
  return out;
}
