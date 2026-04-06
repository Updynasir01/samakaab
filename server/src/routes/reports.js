import { Router } from "express";
import { query, validationResult } from "express-validator";
import CreditEntry from "../models/CreditEntry.js";
import PaymentEntry from "../models/PaymentEntry.js";
import Invoice from "../models/Invoice.js";
import Customer from "../models/Customer.js";
import { authRequired } from "../middleware/auth.js";
import { getBalancesForCustomers } from "../services/balance.js";

const router = Router();
router.use(authRequired);

function monthRange(year, month1to12) {
  const start = new Date(year, month1to12 - 1, 1);
  const end = new Date(year, month1to12, 0, 23, 59, 59, 999);
  return { start, end };
}

function yearRange(year) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);
  return { start, end };
}

router.get(
  "/monthly",
  query("year").isInt({ min: 2000, max: 2100 }),
  query("month").isInt({ min: 1, max: 12 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    const { start, end } = monthRange(year, month);

    const [creditAgg, payAgg, invoiceAgg, invoiceCount, creditEntryCount, paymentEntryCount] =
      await Promise.all([
        CreditEntry.aggregate([
          { $match: { dateOfCredit: { $gte: start, $lte: end } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        PaymentEntry.aggregate([
          { $match: { paidAt: { $gte: start, $lte: end } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        Invoice.aggregate([
          { $match: { date: { $gte: start, $lte: end } } },
          {
            $group: {
              _id: null,
              totalSales: { $sum: "$total" },
              totalPaidAtSale: { $sum: "$paidAtSale" },
            },
          },
        ]),
        Invoice.countDocuments({ date: { $gte: start, $lte: end } }),
        CreditEntry.countDocuments({ dateOfCredit: { $gte: start, $lte: end } }),
        PaymentEntry.countDocuments({ paidAt: { $gte: start, $lte: end } }),
      ]);

    const totalCreditGiven = creditAgg[0]?.total || 0;
    const totalPaymentsRecorded = payAgg[0]?.total || 0;
    const inv = invoiceAgg[0] || {};
    const totalSales = inv.totalSales || 0;
    const totalPaidAtSale = inv.totalPaidAtSale || 0;
    /** All cash in for the period: till (invoice) + recorded payments — same idea as dashboard. */
    const totalMoneyReceived = totalPaidAtSale + totalPaymentsRecorded;

    const customers = await Customer.find().lean();
    const ids = customers.map((c) => c._id);
    const balances = await getBalancesForCustomers(ids);
    const owing = customers
      .map((c) => {
        const b = balances.get(String(c._id));
        return {
          ...c,
          balance: b.balance,
          totalCredit: b.totalCredit,
          totalPayments: b.totalPayments,
        };
      })
      .filter((c) => c.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    const outstandingTotal = owing.reduce((s, c) => s + c.balance, 0);

    res.json({
      period: { year, month, label: `${year}-${String(month).padStart(2, "0")}` },
      /** How many rows of each kind fall in this month (sums above are from these same filters). */
      transactionCounts: {
        invoices: invoiceCount,
        creditEntries: creditEntryCount,
        paymentEntries: paymentEntryCount,
      },
      totalCreditGiven,
      totalSales,
      totalPaidAtSale,
      totalPaymentsRecorded,
      totalMoneyReceived,
      /** @deprecated use totalPaymentsRecorded — was payments only */
      totalCashReceived: totalPaymentsRecorded,
      totalOutstandingBalance: outstandingTotal,
      customersWhoOwe: owing,
    });
  }
);

router.get(
  "/yearly",
  query("year").isInt({ min: 2000, max: 2100 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const year = Number(req.query.year);
    const { start, end } = yearRange(year);

    const [
      creditAgg,
      payAgg,
      invoiceAgg,
      monthlyCredits,
      monthlyPayments,
      monthlyInvoices,
      yearlyInvoiceCount,
      yearlyCreditEntryCount,
      yearlyPaymentEntryCount,
    ] = await Promise.all([
      CreditEntry.aggregate([
        { $match: { dateOfCredit: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      PaymentEntry.aggregate([
        { $match: { paidAt: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Invoice.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: null,
            totalSales: { $sum: "$total" },
            totalPaidAtSale: { $sum: "$paidAtSale" },
          },
        },
      ]),
      CreditEntry.aggregate([
        { $match: { dateOfCredit: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { $month: "$dateOfCredit" },
            total: { $sum: "$amount" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      PaymentEntry.aggregate([
        { $match: { paidAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { $month: "$paidAt" },
            total: { $sum: "$amount" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Invoice.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { $month: "$date" },
            totalSales: { $sum: "$total" },
            paidAtSale: { $sum: "$paidAtSale" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Invoice.countDocuments({ date: { $gte: start, $lte: end } }),
      CreditEntry.countDocuments({ dateOfCredit: { $gte: start, $lte: end } }),
      PaymentEntry.countDocuments({ paidAt: { $gte: start, $lte: end } }),
    ]);

    const customers = await Customer.find().lean();
    const ids = customers.map((c) => c._id);
    const balances = await getBalancesForCustomers(ids);
    const withBal = customers.map((c) => {
      const b = balances.get(String(c._id));
      return { ...c, balance: b.balance, totalCredit: b.totalCredit, totalPayments: b.totalPayments };
    });
    const biggestDebtors = [...withBal].filter((c) => c.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 10);

    const yInv = invoiceAgg[0] || {};
    const yearlyTotalSales = yInv.totalSales || 0;
    const yearlyTotalPaidAtSale = yInv.totalPaidAtSale || 0;
    const yearlyPaymentsRecorded = payAgg[0]?.total || 0;
    const yearlyMoneyReceived = yearlyTotalPaidAtSale + yearlyPaymentsRecorded;

    res.json({
      year,
      transactionCounts: {
        invoices: yearlyInvoiceCount,
        creditEntries: yearlyCreditEntryCount,
        paymentEntries: yearlyPaymentEntryCount,
      },
      yearlyCreditTotal: creditAgg[0]?.total || 0,
      yearlyTotalSales,
      yearlyTotalPaidAtSale,
      yearlyPaymentsRecorded,
      yearlyMoneyReceived,
      /** @deprecated use yearlyPaymentsRecorded */
      yearlyIncome: yearlyPaymentsRecorded,
      biggestDebtors,
      paymentTrendsByMonth: monthlyPayments.map((m) => ({ month: m._id, total: m.total })),
      creditTrendsByMonth: monthlyCredits.map((m) => ({ month: m._id, total: m.total })),
      salesTrendsByMonth: monthlyInvoices.map((m) => ({
        month: m._id,
        totalSales: m.totalSales,
        paidAtSale: m.paidAtSale,
      })),
    });
  }
);

export default router;
