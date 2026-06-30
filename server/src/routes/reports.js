import { Router } from "express";
import { query, validationResult } from "express-validator";
import CreditEntry from "../models/CreditEntry.js";
import PaymentEntry from "../models/PaymentEntry.js";
import Invoice from "../models/Invoice.js";
import Customer from "../models/Customer.js";
import { authRequired } from "../middleware/auth.js";
import { getBalancesForCustomers } from "../services/balance.js";
import { computeMoneyReceived } from "../services/moneyTotals.js";
import { excludedPaymentNoteFilter } from "../services/balance.js";
import {
  calendarMonthGroup,
  matchCalendarYear,
  matchCalendarYearMonth,
} from "../services/reportDates.js";

const router = Router();
router.use(authRequired);

function payMatchYearMonth(year, month) {
  return { $and: [excludedPaymentNoteFilter(), matchCalendarYearMonth("$paidAt", year, month)] };
}

function payMatchYear(year) {
  return { $and: [excludedPaymentNoteFilter(), matchCalendarYear("$paidAt", year)] };
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

    const [creditAgg, payAgg, invoiceAgg, invoiceCount, creditEntryCount, paymentEntryCount] =
      await Promise.all([
        CreditEntry.aggregate([
          { $match: matchCalendarYearMonth("$dateOfCredit", year, month) },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        PaymentEntry.aggregate([
          { $match: payMatchYearMonth(year, month) },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        Invoice.aggregate([
          { $match: matchCalendarYearMonth("$date", year, month) },
          {
            $group: {
              _id: null,
              totalSales: { $sum: "$total" },
              totalPaidAtSale: { $sum: "$paidAtSale" },
            },
          },
        ]),
        Invoice.countDocuments(matchCalendarYearMonth("$date", year, month)),
        CreditEntry.countDocuments(matchCalendarYearMonth("$dateOfCredit", year, month)),
        PaymentEntry.countDocuments(payMatchYearMonth(year, month)),
      ]);

    const totalCreditGiven = creditAgg[0]?.total || 0;
    const totalPaymentsRecorded = payAgg[0]?.total || 0;
    const inv = invoiceAgg[0] || {};
    const totalSales = inv.totalSales || 0;
    const totalPaidAtSale = inv.totalPaidAtSale || 0;
    const totalMoneyReceived = computeMoneyReceived(totalPaidAtSale, totalPaymentsRecorded);
    const netOwedInPeriod = totalCreditGiven - totalMoneyReceived;

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
      netOwedInPeriod,
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
      invoicesAllTime,
    ] = await Promise.all([
      CreditEntry.aggregate([
        { $match: matchCalendarYear("$dateOfCredit", year) },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      PaymentEntry.aggregate([
        { $match: payMatchYear(year) },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Invoice.aggregate([
        { $match: matchCalendarYear("$date", year) },
        {
          $group: {
            _id: null,
            totalSales: { $sum: "$total" },
            totalPaidAtSale: { $sum: "$paidAtSale" },
          },
        },
      ]),
      CreditEntry.aggregate([
        { $match: matchCalendarYear("$dateOfCredit", year) },
        {
          $group: {
            _id: calendarMonthGroup("$dateOfCredit"),
            total: { $sum: "$amount" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      PaymentEntry.aggregate([
        { $match: payMatchYear(year) },
        {
          $group: {
            _id: calendarMonthGroup("$paidAt"),
            total: { $sum: "$amount" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Invoice.aggregate([
        { $match: matchCalendarYear("$date", year) },
        {
          $group: {
            _id: calendarMonthGroup("$date"),
            totalSales: { $sum: "$total" },
            paidAtSale: { $sum: "$paidAtSale" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Invoice.countDocuments(matchCalendarYear("$date", year)),
      CreditEntry.countDocuments(matchCalendarYear("$dateOfCredit", year)),
      PaymentEntry.countDocuments(payMatchYear(year)),
      Invoice.countDocuments({}),
    ]);

    const customers = await Customer.find().lean();
    const ids = customers.map((c) => c._id);
    const balances = await getBalancesForCustomers(ids);
    const withBal = customers.map((c) => {
      const b = balances.get(String(c._id));
      return { ...c, balance: b.balance, totalCredit: b.totalCredit, totalPayments: b.totalPayments };
    });
    const biggestDebtors = [...withBal].filter((c) => c.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 10);
    const totalOutstandingBalance = withBal.filter((c) => c.balance > 0).reduce((s, c) => s + c.balance, 0);

    const yInv = invoiceAgg[0] || {};
    const yearlyTotalSales = yInv.totalSales || 0;
    const yearlyTotalPaidAtSale = yInv.totalPaidAtSale || 0;
    const yearlyPaymentsRecorded = payAgg[0]?.total || 0;
    const yearlyMoneyReceived = computeMoneyReceived(yearlyTotalPaidAtSale, yearlyPaymentsRecorded);
    const yearlyNetOwedInPeriod = (creditAgg[0]?.total || 0) - yearlyMoneyReceived;

    res.json({
      year,
      transactionCounts: {
        invoices: yearlyInvoiceCount,
        creditEntries: yearlyCreditEntryCount,
        paymentEntries: yearlyPaymentEntryCount,
      },
      invoicesAllTime,
      invoicesOutsideYear: Math.max(0, invoicesAllTime - yearlyInvoiceCount),
      yearlyCreditTotal: creditAgg[0]?.total || 0,
      yearlyTotalSales,
      yearlyTotalPaidAtSale,
      yearlyPaymentsRecorded,
      yearlyMoneyReceived,
      yearlyNetOwedInPeriod,
      totalOutstandingBalance,
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
