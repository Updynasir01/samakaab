import { Router } from "express";
import mongoose from "mongoose";
import { body, query, validationResult } from "express-validator";
import Invoice from "../models/Invoice.js";
import CreditEntry from "../models/CreditEntry.js";
import PaymentEntry from "../models/PaymentEntry.js";
import Customer from "../models/Customer.js";
import { authRequired, adminOnly } from "../middleware/auth.js";

const router = Router();
router.use(authRequired);

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function buildCreditDescription(invoiceNumber, lineItems) {
  const parts = lineItems.map((l) => `${l.quantity}× ${l.description}`);
  const base = `Invoice #${invoiceNumber}: ${parts.join(", ")}`;
  return base.length > 400 ? `${base.slice(0, 397)}…` : base;
}

async function nextInvoiceNumber() {
  const last = await Invoice.findOne().sort({ invoiceNumber: -1 }).select("invoiceNumber").lean();
  return (last?.invoiceNumber || 0) + 1;
}

/** Sum of PaymentEntry amounts linked to each invoice (record payment / full pay flows). */
async function attachPaymentsRecordedToInvoices(list) {
  if (!list.length) return list;
  const ids = list.map((i) => i._id);
  const agg = await PaymentEntry.aggregate([
    { $match: { invoice: { $in: ids } } },
    { $group: { _id: "$invoice", total: { $sum: "$amount" } } },
  ]);
  const map = new Map(agg.map((a) => [String(a._id), round2(a.total)]));
  for (const inv of list) {
    inv.paymentsRecorded = map.get(String(inv._id)) ?? 0;
  }
  return list;
}

router.get(
  "/",
  query("limit").optional().isInt({ min: 1, max: 200 }),
  async (req, res) => {
    const limit = Number(req.query.limit) || 80;
    const list = await Invoice.find()
      .populate("customer", "fullName phone")
      .sort({ date: -1, invoiceNumber: -1 })
      .limit(limit)
      .lean();
    await attachPaymentsRecordedToInvoices(list);
    attachDeliverySummaryToInvoices(list);
    res.json(list);
  }
);

router.get("/customer/:customerId", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.customerId)) {
    return res.status(400).json({ message: "Invalid customer id" });
  }
  const list = await Invoice.find({ customer: req.params.customerId })
    .sort({ date: -1 })
    .lean();
  await attachPaymentsRecordedToInvoices(list);
  attachDeliverySummaryToInvoices(list);
  res.json(list);
});

function attachDeliverySummaryToInvoices(list) {
  for (const inv of list) {
    const items = Array.isArray(inv.lineItems) ? inv.lineItems : [];
    const totalCount = items.length;
    const deliveredCount = items.filter((li) => li?.delivered === true).length;
    const deliveredValue = round2(
      items.reduce((s, li) => s + (li?.delivered === true ? Number(li?.lineTotal || 0) : 0), 0)
    );
    const totalValue = round2(items.reduce((s, li) => s + Number(li?.lineTotal || 0), 0));
    const remainingValue = round2(Math.max(0, totalValue - deliveredValue));
    inv.delivery = { deliveredCount, totalCount, deliveredValue, remainingValue };
  }
  return list;
}

router.post(
  "/",
  body("lineItems").isArray({ min: 1 }),
  body("lineItems.*.description").trim().notEmpty(),
  body("lineItems.*.quantity").isFloat({ min: 0 }),
  body("lineItems.*.unit").optional().trim(),
  body("lineItems.*.unitPrice").isFloat({ min: 0 }),
  body("date").isISO8601(),
  body("paidAtSale").optional().isFloat({ min: 0 }),
  body("expectedPayDate").optional().isISO8601(),
  body("note").optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Invalid input", errors: errors.array() });
    }

    const rawCustomer = req.body.customer;
    const customerId =
      rawCustomer && rawCustomer !== "" && mongoose.isValidObjectId(rawCustomer) ? rawCustomer : null;

    const paidAtSale = round2(req.body.paidAtSale ?? 0);
    const date = new Date(req.body.date);
    const note = req.body.note || "";

    const lineItems = req.body.lineItems.map((li) => {
      const quantity = round2(li.quantity);
      const unitPrice = round2(li.unitPrice);
      const lineTotal = round2(quantity * unitPrice);
      return {
        description: String(li.description).trim(),
        quantity,
        unit: String(li.unit || "").trim(),
        unitPrice,
        lineTotal,
        delivered: false,
        deliveredAt: null,
      };
    });

    const total = round2(lineItems.reduce((s, l) => s + l.lineTotal, 0));
    if (total <= 0) {
      return res.status(400).json({ message: "Invoice total must be greater than zero" });
    }
    if (paidAtSale > total) {
      return res.status(400).json({ message: "Amount paid at sale cannot exceed invoice total" });
    }

    const creditAmount = round2(total - paidAtSale);
    const EPS = 0.005;

    if (creditAmount > EPS && !customerId) {
      return res.status(400).json({
        message: "Select an existing customer (or create one first) when there is an unpaid balance on the invoice",
      });
    }

    let expectedPayDate = req.body.expectedPayDate ? new Date(req.body.expectedPayDate) : null;
    if (creditAmount > EPS) {
      if (!expectedPayDate || Number.isNaN(expectedPayDate.getTime())) {
        return res.status(400).json({ message: "Expected pay date is required when the invoice is not fully paid at sale" });
      }
    } else {
      expectedPayDate = expectedPayDate || date;
    }

    if (customerId) {
      const c = await Customer.findById(customerId);
      if (!c) return res.status(404).json({ message: "Customer not found" });
    }

    let paymentStatus = "paid";
    if (creditAmount > EPS) {
      paymentStatus = paidAtSale > EPS ? "partial" : "unpaid";
    }

    // No MongoDB multi-document transactions: standalone MongoDB does not support them (replica set only).
    const invoiceNumber = await nextInvoiceNumber();

    const [inv] = await Invoice.create([
      {
        invoiceNumber,
        customer: customerId,
        lineItems,
        total,
        paidAtSale,
        creditAmount: creditAmount > EPS ? creditAmount : 0,
        paymentStatus,
        date,
        note,
        creditEntry: null,
      },
    ]);

    try {
      if (creditAmount > EPS) {
        const credit = await CreditEntry.create([
          {
            customer: customerId,
            amount: creditAmount,
            description: buildCreditDescription(invoiceNumber, lineItems),
            dateOfCredit: date,
            expectedPayDate,
            invoice: inv._id,
          },
        ]);
        inv.creditEntry = credit[0]._id;
        await inv.save();
      }

      // Full pay at sale: record one payment entry for analytics / customer payment list.
      // Partial pay at sale: do NOT create PaymentEntry for paidAtSale — that cash is already
      // in invoice.paidAtSale (money received). A PaymentEntry here double-counts against
      // balance (credits − payments) and triggers closeInvoicesWhenAccountSettled to wipe
      // invoice credit while CreditEntry still shows the debt.
      if (customerId && creditAmount <= EPS) {
        await PaymentEntry.create([
          {
            customer: customerId,
            amount: total,
            paidAt: date,
            note: note ? `Invoice #${invoiceNumber} (paid in full). ${note}` : `Invoice #${invoiceNumber} paid in full`,
            invoice: inv._id,
          },
        ]);
      }
    } catch (err) {
      await CreditEntry.deleteMany({ invoice: inv._id });
      await PaymentEntry.deleteMany({ invoice: inv._id });
      await Invoice.findByIdAndDelete(inv._id);
      throw err;
    }

    const populated = await Invoice.findById(inv._id).populate("customer", "fullName phone").lean();
    await attachPaymentsRecordedToInvoices([populated]);
    attachDeliverySummaryToInvoices([populated]);
    res.status(201).json(populated);
  }
);

router.get(
  "/open",
  query("limit").optional().isInt({ min: 1, max: 200 }),
  async (req, res) => {
    const limit = Number(req.query.limit) || 100;
    const list = await Invoice.find({
      lineItems: { $elemMatch: { delivered: { $ne: true } } },
    })
      .populate("customer", "fullName phone")
      .sort({ date: -1, invoiceNumber: -1 })
      .limit(limit)
      .lean();
    await attachPaymentsRecordedToInvoices(list);
    attachDeliverySummaryToInvoices(list);
    res.json(list);
  }
);

router.get("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid id" });
  }
  const inv = await Invoice.findById(req.params.id).populate("customer", "fullName phone address notes").lean();
  if (!inv) return res.status(404).json({ message: "Invoice not found" });
  await attachPaymentsRecordedToInvoices([inv]);
  attachDeliverySummaryToInvoices([inv]);
  res.json(inv);
});

router.patch(
  "/:id/delivery",
  body("lineItemId").isString().notEmpty(),
  body("delivered").isBoolean(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Invalid input", errors: errors.array() });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ message: "Invoice not found" });

    const { lineItemId, delivered } = req.body;
    const li = inv.lineItems.id(lineItemId);
    if (!li) return res.status(404).json({ message: "Line item not found" });

    li.delivered = Boolean(delivered);
    li.deliveredAt = li.delivered ? new Date() : null;
    await inv.save();

    const out = await Invoice.findById(inv._id).populate("customer", "fullName phone address notes").lean();
    await attachPaymentsRecordedToInvoices([out]);
    attachDeliverySummaryToInvoices([out]);
    res.json(out);
  }
);

router.delete("/:id", adminOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid id" });
  }
  const inv = await Invoice.findById(req.params.id);
  if (!inv) return res.status(404).json({ message: "Not found" });

  await Promise.all([
    inv.creditEntry ? CreditEntry.findByIdAndDelete(inv.creditEntry) : Promise.resolve(),
    PaymentEntry.deleteMany({ invoice: inv._id }),
    Invoice.findByIdAndDelete(inv._id),
  ]);
  res.status(204).send();
});

export default router;
