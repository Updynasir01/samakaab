import { Router } from "express";
import Customer from "../models/Customer.js";
import CreditEntry from "../models/CreditEntry.js";
import PaymentEntry from "../models/PaymentEntry.js";
import Invoice from "../models/Invoice.js";
import { authRequired } from "../middleware/auth.js";
import { getBalancesForCustomers } from "../services/balance.js";
import { closeInvoicesWhenAccountSettled } from "../services/invoiceSync.js";

const router = Router();
router.use(authRequired);

router.get("/summary", async (_req, res) => {
  const idsWithOpenInvoices = await Invoice.distinct("customer", {
    paymentStatus: { $in: ["unpaid", "partial"] },
    customer: { $exists: true, $ne: null },
  });
  for (const cid of idsWithOpenInvoices) {
    await closeInvoicesWhenAccountSettled(cid);
  }

  const customers = await Customer.find().select("_id fullName phone").lean();
  const ids = customers.map((c) => c._id);
  const balances = await getBalancesForCustomers(ids);

  const overdue = [];
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const overdueCredits = await CreditEntry.find({
    expectedPayDate: { $lt: startOfToday },
  })
    .populate("customer", "fullName phone")
    .lean();

  // For overdue credits that are linked to invoices, compute remaining per-invoice so we
  // don't alert on credits already fully paid via invoice-linked payments.
  const overdueInvoiceIds = overdueCredits
    .map((cr) => cr.invoice)
    .filter(Boolean);
  const paidByInvoiceAgg = overdueInvoiceIds.length
    ? await PaymentEntry.aggregate([
        { $match: { invoice: { $in: overdueInvoiceIds } } },
        { $group: { _id: "$invoice", total: { $sum: "$amount" } } },
      ])
    : [];
  const paidByInvoice = new Map(paidByInvoiceAgg.map((r) => [String(r._id), r.total || 0]));

  for (const cr of overdueCredits) {
    const custId = String(cr.customer._id || cr.customer);
    const bal = balances.get(custId);
    if (!bal || bal.balance <= 0) continue;

    // If this credit entry is tied to an invoice, show it only if that invoice still has remaining unpaid amount.
    // (Payments must be linked to the invoice to count here.)
    const EPS = 0.005;
    if (cr.invoice) {
      const paid = paidByInvoice.get(String(cr.invoice)) || 0;
      const remaining = Math.max(0, (cr.amount || 0) - paid);
      if (remaining <= EPS) continue;
      overdue.push({
        creditId: cr._id,
        customerId: cr.customer._id,
        customerName: cr.customer.fullName,
        phone: cr.customer.phone,
        expectedPayDate: cr.expectedPayDate,
        description: cr.description,
        amount: remaining,
        message: `Customer ${cr.customer.fullName} should have paid by ${cr.expectedPayDate.toISOString().slice(0, 10)} — please follow up.`,
      });
      continue;
    }
    overdue.push({
      creditId: cr._id,
      customerId: cr.customer._id,
      customerName: cr.customer.fullName,
      phone: cr.customer.phone,
      expectedPayDate: cr.expectedPayDate,
      description: cr.description,
      amount: cr.amount,
      message: `Customer ${cr.customer.fullName} should have paid by ${cr.expectedPayDate.toISOString().slice(0, 10)} — please follow up.`,
    });
  }

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  weekAgo.setHours(0, 0, 0, 0);

  const creditWeek = await CreditEntry.aggregate([
    { $match: { dateOfCredit: { $gte: weekAgo } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$dateOfCredit" } }, total: { $sum: "$amount" } } },
    { $sort: { _id: 1 } },
  ]);

  const [invoiceCashWeek, paymentsWeek] = await Promise.all([
    Invoice.aggregate([
      { $match: { date: { $gte: weekAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          total: { $sum: "$paidAtSale" },
        },
      },
    ]),
    PaymentEntry.aggregate([
      { $match: { paidAt: { $gte: weekAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$paidAt" } },
          total: { $sum: "$amount" },
        },
      },
    ]),
  ]);

  const moneyInByDay = new Map();
  for (const row of invoiceCashWeek) {
    const k = row._id;
    moneyInByDay.set(k, (moneyInByDay.get(k) || 0) + (row.total || 0));
  }
  for (const row of paymentsWeek) {
    const k = row._id;
    moneyInByDay.set(k, (moneyInByDay.get(k) || 0) + (row.total || 0));
  }

  const weeklyMoneyInByDay = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    d.setUTCHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    weeklyMoneyInByDay.push({ date: key, total: moneyInByDay.get(key) || 0 });
  }

  const [totalCreditAgg, totalPaidAgg, paidAtSaleAgg] = await Promise.all([
    CreditEntry.aggregate([{ $group: { _id: null, t: { $sum: "$amount" } } }]),
    PaymentEntry.aggregate([{ $group: { _id: null, t: { $sum: "$amount" } } }]),
    Invoice.aggregate([{ $group: { _id: null, t: { $sum: "$paidAtSale" } } }]),
  ]);
  const totalCreditAllTime = totalCreditAgg[0]?.t || 0;
  const totalPaidAllTime = totalPaidAgg[0]?.t || 0;
  /** Cash/card taken when each invoice was created (walk-in full pay + partial at sale). */
  const totalPaidAtSaleAllTime = paidAtSaleAgg[0]?.t || 0;
  /** All money in: collected at sale plus payments recorded on customer accounts. */
  const moneyReceivedAllTime = totalPaidAtSaleAllTime + totalPaidAllTime;
  const unpaid = Math.max(0, totalCreditAllTime - totalPaidAllTime);

  const [aggRow] = await Invoice.aggregate([
    { $match: { paymentStatus: { $in: ["unpaid", "partial"] } } },
    {
      $group: {
        _id: null,
        totalCredit: { $sum: "$creditAmount" },
      },
    },
  ]);

  const totalInvoiceDebt = aggRow?.totalCredit || 0;

  const debtorGroups = await Invoice.aggregate([
    {
      $match: {
        paymentStatus: { $in: ["unpaid", "partial"] },
        customer: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: "$customer",
        balance: { $sum: "$creditAmount" },
      },
    },
    { $sort: { balance: -1 } },
  ]);

  const debtorIds = debtorGroups.map((g) => g._id);
  const debtorCustomers = await Customer.find({ _id: { $in: debtorIds } })
    .select("fullName phone")
    .lean();
  const custMap = new Map(debtorCustomers.map((c) => [String(c._id), c]));

  const debtors = debtorGroups.map((g) => {
    const c = custMap.get(String(g._id));
    return {
      customerId: g._id,
      fullName: c?.fullName || "?",
      phone: c?.phone || "",
      balance: g.balance,
    };
  });

  res.json({
    totalOwedToday: totalInvoiceDebt,
    moneyReceived: moneyReceivedAllTime,
    paidAtSaleAllTime: totalPaidAtSaleAllTime,
    paymentsRecordedAllTime: totalPaidAllTime,
    customersWithDebt: debtors.length,
    debtors,
    overdueAlerts: overdue,
    weeklyCreditByDay: creditWeek.map((x) => ({ date: x._id, credit: x.total })),
    weeklyMoneyInByDay,
    pie: {
      totalCredit: totalCreditAllTime,
      totalPaid: totalPaidAllTime,
      outstanding: unpaid,
      moneyReceived: moneyReceivedAllTime,
      outstandingInvoiceDebt: totalInvoiceDebt,
    },
  });
});

export default router;
