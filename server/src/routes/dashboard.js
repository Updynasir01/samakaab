import { Router } from "express";
import Customer from "../models/Customer.js";
import CreditEntry from "../models/CreditEntry.js";
import Invoice from "../models/Invoice.js";
import { authRequired } from "../middleware/auth.js";
import { BALANCE_EPS, getBalancesForCustomers, sumPositiveAccountBalances } from "../services/balance.js";
import { syncCustomersWithOpenDebt } from "../services/invoiceSync.js";
import {
  computeMoneyReceived,
  sumEffectivePayments,
  sumPaidAtSale,
  weeklyMoneyInByDay as buildWeeklyMoneyInByDay,
} from "../services/moneyTotals.js";

const router = Router();
router.use(authRequired);

router.get("/summary", async (_req, res) => {
  await syncCustomersWithOpenDebt();

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

  const overdueInvoiceIds = overdueCredits.map((cr) => cr.invoice).filter(Boolean);
  const overdueInvoices = overdueInvoiceIds.length
    ? await Invoice.find({ _id: { $in: overdueInvoiceIds } })
        .select("creditAmount paymentStatus")
        .lean()
    : [];
  const invoiceRemainingMap = new Map(
    overdueInvoices.map((inv) => [String(inv._id), Number(inv.creditAmount || 0)])
  );

  for (const cr of overdueCredits) {
    const custId = String(cr.customer._id || cr.customer);
    const bal = balances.get(custId);
    if (!bal || bal.balance <= BALANCE_EPS) continue;

    if (cr.invoice) {
      const remaining = invoiceRemainingMap.get(String(cr.invoice)) ?? 0;
      if (remaining <= BALANCE_EPS) continue;
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

  const weeklyMoneyInByDay = await buildWeeklyMoneyInByDay(weekAgo);

  const [totalCreditAllTime, totalPaidAtSaleAllTime, totalEffectivePaymentsAllTime, totalAccountBalanceOwed] =
    await Promise.all([
      CreditEntry.aggregate([{ $group: { _id: null, t: { $sum: "$amount" } } }]).then((r) => r[0]?.t || 0),
      sumPaidAtSale({}),
      sumEffectivePayments({}),
      sumPositiveAccountBalances(ids),
    ]);

  const moneyReceivedAllTime = computeMoneyReceived(totalPaidAtSaleAllTime, totalEffectivePaymentsAllTime);

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

  const openInvoices = await Invoice.find({
    paymentStatus: { $in: ["unpaid", "partial"] },
    creditAmount: { $gt: BALANCE_EPS },
  })
    .sort({ invoiceNumber: -1 })
    .select("invoiceNumber customer creditAmount")
    .lean();

  const invoicesByCustomer = new Map();
  for (const inv of openInvoices) {
    const cid = String(inv.customer);
    if (!invoicesByCustomer.has(cid)) invoicesByCustomer.set(cid, []);
    invoicesByCustomer.get(cid).push({
      invoiceId: inv._id,
      invoiceNumber: inv.invoiceNumber,
      creditAmount: inv.creditAmount,
    });
  }

  const debtors = debtorGroups.map((g) => {
    const c = custMap.get(String(g._id));
    return {
      customerId: g._id,
      fullName: c?.fullName || "?",
      phone: c?.phone || "",
      balance: g.balance,
      invoices: invoicesByCustomer.get(String(g._id)) || [],
    };
  });

  res.json({
    totalOwedToday: totalInvoiceDebt,
    totalAccountBalanceOwed,
    moneyReceived: moneyReceivedAllTime,
    paidAtSaleAllTime: totalPaidAtSaleAllTime,
    paymentsRecordedAllTime: totalEffectivePaymentsAllTime,
    customersWithDebt: debtors.length,
    debtors,
    overdueAlerts: overdue,
    weeklyCreditByDay: creditWeek.map((x) => ({ date: x._id, credit: x.total })),
    weeklyMoneyInByDay,
    pie: {
      totalCredit: totalCreditAllTime,
      totalPaid: totalEffectivePaymentsAllTime,
      outstanding: totalAccountBalanceOwed,
      moneyReceived: moneyReceivedAllTime,
      outstandingInvoiceDebt: totalInvoiceDebt,
    },
  });
});

export default router;
