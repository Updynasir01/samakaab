import PaymentEntry from "../models/PaymentEntry.js";
import Invoice from "../models/Invoice.js";
import { excludedPaymentNoteFilter } from "./balance.js";

export function serverTimezone() {
  return process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function localDateKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function dateToStringGroup(field) {
  return { $dateToString: { format: "%Y-%m-%d", date: field, timezone: serverTimezone() } };
}

/** Effective recorded payments (excludes duplicate paid-in-full / payment-at-sale rows). */
export async function sumEffectivePayments(match = {}) {
  const agg = await PaymentEntry.aggregate([
    { $match: { ...match, ...excludedPaymentNoteFilter() } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  return agg[0]?.total || 0;
}

export async function sumPaidAtSale(match = {}) {
  const agg = await Invoice.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$paidAtSale" } } },
  ]);
  return agg[0]?.total || 0;
}

/** All cash in: paid at sale on invoices + effective payments (no double-count). */
export function computeMoneyReceived(paidAtSaleTotal, effectivePaymentsTotal) {
  return (paidAtSaleTotal || 0) + (effectivePaymentsTotal || 0);
}

export async function weeklyMoneyInByDay(weekAgo) {
  const tz = serverTimezone();
  const [invoiceCashWeek, paymentsWeek] = await Promise.all([
    Invoice.aggregate([
      { $match: { date: { $gte: weekAgo } } },
      {
        $group: {
          _id: dateToStringGroup("$date"),
          total: { $sum: "$paidAtSale" },
        },
      },
    ]),
    PaymentEntry.aggregate([
      { $match: { paidAt: { $gte: weekAgo }, ...excludedPaymentNoteFilter() } },
      {
        $group: {
          _id: dateToStringGroup("$paidAt"),
          total: { $sum: "$amount" },
        },
      },
    ]),
  ]);

  const moneyInByDay = new Map();
  for (const row of invoiceCashWeek) {
    moneyInByDay.set(row._id, (moneyInByDay.get(row._id) || 0) + (row.total || 0));
  }
  for (const row of paymentsWeek) {
    moneyInByDay.set(row._id, (moneyInByDay.get(row._id) || 0) + (row.total || 0));
  }

  const weeklyMoneyInByDay = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = localDateKey(d);
    weeklyMoneyInByDay.push({ date: key, total: moneyInByDay.get(key) || 0 });
  }
  return weeklyMoneyInByDay;
}
