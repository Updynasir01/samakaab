import { Router } from "express";
import mongoose from "mongoose";
import { body, query, validationResult } from "express-validator";
import Invoice from "../models/Invoice.js";
import CreditEntry from "../models/CreditEntry.js";
import PaymentEntry from "../models/PaymentEntry.js";
import Customer from "../models/Customer.js";
import { authRequired, adminOnly, actorUsername } from "../middleware/auth.js";
import { excludedPaymentNoteFilter, BALANCE_EPS } from "../services/balance.js";
import { syncCustomersWithOpenDebt, syncCustomerInvoices } from "../services/invoiceSync.js";

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

router.get("/next-number", async (_req, res) => {
  const invoiceNumber = await nextInvoiceNumber();
  res.json({ invoiceNumber });
});

/** Sum of PaymentEntry amounts linked to each invoice (record payment / full pay flows). */
function originalCreditForInvoice(inv, creditMap) {
  if (inv.creditEntry) {
    const cr = creditMap.get(String(inv.creditEntry));
    return Number(cr?.amount || 0);
  }
  return Math.max(0, round2(Number(inv.total) - Number(inv.paidAtSale || 0)));
}

async function attachPaymentsRecordedToInvoices(list) {
  if (!list.length) return list;
  const ids = list.map((i) => i._id);
  const creditIds = list.map((i) => i.creditEntry).filter(Boolean);
  const [agg, credits] = await Promise.all([
    PaymentEntry.aggregate([
      { $match: { invoice: { $in: ids }, ...excludedPaymentNoteFilter() } },
      { $group: { _id: "$invoice", total: { $sum: "$amount" } } },
    ]),
    creditIds.length
      ? CreditEntry.find({ _id: { $in: creditIds } }).select("amount").lean()
      : Promise.resolve([]),
  ]);
  const linkedMap = new Map(agg.map((a) => [String(a._id), round2(a.total)]));
  const creditMap = new Map(credits.map((c) => [String(c._id), c]));
  for (const inv of list) {
    const linked = linkedMap.get(String(inv._id)) ?? 0;
    const original = originalCreditForInvoice(inv, creditMap);
    const remaining = round2(Number(inv.creditAmount || 0));
    const applied = Math.max(0, round2(original - remaining));
    const fromAccount = Math.max(0, round2(applied - linked));
    inv.paymentsRecorded = linked;
    inv.paymentsApplied = applied;
    inv.paymentsFromAccount = fromAccount;
    inv.originalCredit = original;
  }
  return list;
}

router.get(
  "/",
  query("limit").optional().isInt({ min: 1, max: 500 }),
  query("skip").optional().isInt({ min: 0 }),
  query("q").optional().trim(),
  query("status").optional().isIn(["all", "paid", "partial", "unpaid"]),
  query("date").optional().isISO8601(),
  async (req, res) => {
    await syncCustomersWithOpenDebt();
    const limit = Number(req.query.limit) || 50;
    const skip = Number(req.query.skip) || 0;
    const filter = await buildInvoiceListFilter(req.query);
    const [total, list] = await Promise.all([
      Invoice.countDocuments(filter),
      Invoice.find(filter)
        .populate("customer", "fullName phone")
        .sort({ date: -1, invoiceNumber: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);
    await attachPaymentsRecordedToInvoices(list);
    attachDeliverySummaryToInvoices(list);
    res.json({ items: list, total, limit, skip });
  }
);

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function buildInvoiceListFilter({ q, status, date } = {}) {
  const filter = {};
  if (status && status !== "all") filter.paymentStatus = status;
  if (date) {
    const start = new Date(date);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      filter.date = { $gte: start, $lte: end };
    }
  }
  const needle = String(q || "").trim();
  if (!needle) return filter;

  const rx = new RegExp(escapeRegex(needle), "i");
  const or = [
    { orderNumber: rx },
    { note: rx },
    { createdBy: rx },
    { "lineItems.description": rx },
  ];
  if (/^\d+$/.test(needle)) {
    or.push({ invoiceNumber: Number(needle) });
  }
  const customers = await Customer.find({
    $or: [{ fullName: rx }, { phone: rx }],
  })
    .select("_id")
    .lean();
  if (customers.length) {
    or.push({ customer: { $in: customers.map((c) => c._id) } });
  }
  filter.$or = or;
  return filter;
}

router.get("/customer/:customerId", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.customerId)) {
    return res.status(400).json({ message: "Invalid customer id" });
  }
  await syncCustomerInvoices(req.params.customerId);
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

function buildLineItemsFromBody(bodyItems, existingInvoice = null) {
  const existingById = new Map(
    (existingInvoice?.lineItems || []).map((li) => [String(li._id), li])
  );
  return bodyItems.map((li) => {
    const quantity = round2(li.quantity);
    const unitPrice = round2(li.unitPrice);
    const lineTotal = round2(quantity * unitPrice);
    const base = {
      description: String(li.description).trim(),
      quantity,
      unit: String(li.unit || "").trim(),
      unitPrice,
      lineTotal,
    };
    const existingId = li._id || li.id;
    if (existingId && existingById.has(String(existingId))) {
      const prev = existingById.get(String(existingId));
      return {
        ...base,
        _id: prev._id,
        delivered: prev.delivered === true,
        deliveredAt: prev.deliveredAt || null,
      };
    }
    return { ...base, delivered: false, deliveredAt: null };
  });
}

async function paymentsAppliedToInvoice(inv) {
  let original = 0;
  if (inv.creditEntry) {
    const cr = await CreditEntry.findById(inv.creditEntry).select("amount").lean();
    original = Number(cr?.amount || 0);
  } else {
    original = Math.max(0, round2(Number(inv.total) - Number(inv.paidAtSale || 0)));
  }
  const remaining = round2(Number(inv.creditAmount || 0));
  return Math.max(0, round2(original - remaining));
}

async function attachCreditMetaToInvoice(inv) {
  if (!inv?.creditEntry) return inv;
  const cr = await CreditEntry.findById(inv.creditEntry).select("expectedPayDate amount").lean();
  if (cr) {
    inv.expectedPayDate = cr.expectedPayDate;
    inv.creditEntryAmount = cr.amount;
  }
  return inv;
}

async function reconcileInvoiceCreditAndPayments(inv, {
  customerId,
  creditAmount,
  total,
  paidAtSale,
  date,
  expectedPayDate,
  lineItems,
  invoiceNumber,
  note,
  enteredBy,
  EPS,
}) {
  if (creditAmount > EPS) {
    const creditPayload = {
      customer: customerId,
      amount: creditAmount,
      description: buildCreditDescription(invoiceNumber, lineItems),
      dateOfCredit: date,
      expectedPayDate,
    };
    if (inv.creditEntry) {
      await CreditEntry.findByIdAndUpdate(inv.creditEntry, { $set: creditPayload });
    } else {
      const [credit] = await CreditEntry.create([
        { ...creditPayload, invoice: inv._id, createdBy: enteredBy },
      ]);
      inv.creditEntry = credit._id;
    }
    await PaymentEntry.deleteMany({ invoice: inv._id, note: { $regex: /paid in full/i } });
  } else if (inv.creditEntry) {
    await CreditEntry.findByIdAndDelete(inv.creditEntry);
    inv.creditEntry = null;
  }

  if (customerId && creditAmount <= EPS) {
    const payNote = note
      ? `Invoice #${invoiceNumber} (paid in full). ${note}`
      : `Invoice #${invoiceNumber} paid in full`;
    const existing = await PaymentEntry.findOne({ invoice: inv._id, note: { $regex: /paid in full/i } });
    if (existing) {
      existing.amount = total;
      existing.paidAt = date;
      existing.note = payNote;
      existing.customer = customerId;
      await existing.save();
    } else {
      await PaymentEntry.create([
        {
          customer: customerId,
          amount: total,
          paidAt: date,
          note: payNote,
          invoice: inv._id,
          createdBy: enteredBy,
        },
      ]);
    }
  }
}

router.post(
  "/",
  body("lineItems").isArray({ min: 1 }),
  body("lineItems.*.description").trim().notEmpty(),
  body("lineItems.*.quantity").isFloat({ min: 0 }),
  body("lineItems.*.unit").optional().trim(),
  body("lineItems.*.unitPrice").isFloat({ min: 0 }),
  body("invoiceNumber").optional().isInt({ min: 1 }),
  body("orderNumber").optional().trim(),
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
    const orderNumber = String(req.body.orderNumber || "").trim();

    const lineItems = buildLineItemsFromBody(req.body.lineItems);

    const total = round2(lineItems.reduce((s, l) => s + l.lineTotal, 0));
    if (total <= 0) {
      return res.status(400).json({ message: "Invoice total must be greater than zero" });
    }
    if (paidAtSale > total) {
      return res.status(400).json({ message: "Amount paid at sale cannot exceed invoice total" });
    }

    const creditAmount = round2(total - paidAtSale);
    const EPS = BALANCE_EPS;

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
    let invoiceNumber = req.body.invoiceNumber ? Number(req.body.invoiceNumber) : null;
    if (invoiceNumber != null) {
      const exists = await Invoice.exists({ invoiceNumber });
      if (exists) return res.status(409).json({ message: `Invoice number #${invoiceNumber} already exists` });
    } else {
      invoiceNumber = await nextInvoiceNumber();
    }

    const enteredBy = actorUsername(req);
    const [inv] = await Invoice.create([
      {
        invoiceNumber,
        orderNumber,
        customer: customerId,
        lineItems,
        total,
        paidAtSale,
        creditAmount: creditAmount > EPS ? creditAmount : 0,
        paymentStatus,
        date,
        note,
        createdBy: enteredBy,
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
            createdBy: enteredBy,
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
            createdBy: enteredBy,
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
    await syncCustomersWithOpenDebt();
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
  if (inv.customer?._id) await syncCustomerInvoices(inv.customer._id);
  const fresh = await Invoice.findById(req.params.id).populate("customer", "fullName phone address notes").lean();
  await attachCreditMetaToInvoice(fresh);
  await attachPaymentsRecordedToInvoices([fresh]);
  attachDeliverySummaryToInvoices([fresh]);
  res.json(fresh);
});

router.patch(
  "/:id",
  body("lineItems").isArray({ min: 1 }),
  body("lineItems.*.description").trim().notEmpty(),
  body("lineItems.*.quantity").isFloat({ min: 0 }),
  body("lineItems.*.unit").optional().trim(),
  body("lineItems.*.unitPrice").isFloat({ min: 0 }),
  body("lineItems.*._id").optional().isString(),
  body("orderNumber").optional().trim(),
  body("date").isISO8601(),
  body("paidAtSale").optional().isFloat({ min: 0 }),
  body("expectedPayDate").optional().isISO8601(),
  body("note").optional().trim(),
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

    const oldCustomerId = inv.customer ? String(inv.customer) : null;
    if (oldCustomerId) await syncCustomerInvoices(oldCustomerId);

    const synced = await Invoice.findById(inv._id).lean();
    const paymentsApplied = await paymentsAppliedToInvoice(synced);

    const rawCustomer = req.body.customer;
    let customerId = inv.customer;
    if (rawCustomer !== undefined) {
      customerId =
        rawCustomer && rawCustomer !== "" && mongoose.isValidObjectId(rawCustomer) ? rawCustomer : null;
    }

    const paidAtSale = round2(req.body.paidAtSale ?? inv.paidAtSale ?? 0);
    const date = new Date(req.body.date);
    const note = req.body.note ?? inv.note ?? "";
    const orderNumber = String(req.body.orderNumber ?? inv.orderNumber ?? "").trim();
    const lineItems = buildLineItemsFromBody(req.body.lineItems, synced);

    const total = round2(lineItems.reduce((s, l) => s + l.lineTotal, 0));
    if (total <= 0) {
      return res.status(400).json({ message: "Invoice total must be greater than zero" });
    }
    if (paidAtSale > total) {
      return res.status(400).json({ message: "Amount paid at sale cannot exceed invoice total" });
    }

    const minTotal = round2(paidAtSale + paymentsApplied);
    if (total + BALANCE_EPS < minTotal) {
      return res.status(400).json({
        message: `Cannot reduce total below ${minTotal.toFixed(2)} — that amount is already paid on this invoice`,
      });
    }

    const creditAmount = round2(total - paidAtSale);
    const EPS = BALANCE_EPS;

    if (creditAmount > EPS && !customerId) {
      return res.status(400).json({
        message: "Select a customer when there is an unpaid balance on the invoice",
      });
    }

    let expectedPayDate = req.body.expectedPayDate ? new Date(req.body.expectedPayDate) : null;
    if (creditAmount > EPS) {
      if (!expectedPayDate || Number.isNaN(expectedPayDate.getTime())) {
        if (synced.creditEntry) {
          const cr = await CreditEntry.findById(synced.creditEntry).select("expectedPayDate").lean();
          expectedPayDate = cr?.expectedPayDate ? new Date(cr.expectedPayDate) : null;
        }
        if (!expectedPayDate || Number.isNaN(expectedPayDate.getTime())) {
          return res.status(400).json({ message: "Expected pay date is required when the invoice is not fully paid at sale" });
        }
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

    inv.customer = customerId;
    inv.lineItems = lineItems;
    inv.total = total;
    inv.paidAtSale = paidAtSale;
    inv.creditAmount = creditAmount > EPS ? creditAmount : 0;
    inv.paymentStatus = paymentStatus;
    inv.date = date;
    inv.note = note;
    inv.orderNumber = orderNumber;

    const enteredBy = actorUsername(req);
    try {
      await reconcileInvoiceCreditAndPayments(inv, {
        customerId,
        creditAmount,
        total,
        paidAtSale,
        date,
        expectedPayDate,
        lineItems,
        invoiceNumber: inv.invoiceNumber,
        note,
        enteredBy,
        EPS,
      });

      if (customerId) {
        await PaymentEntry.updateMany({ invoice: inv._id }, { $set: { customer: customerId } });
      }

      await inv.save();
    } catch (err) {
      throw err;
    }

    const customersToSync = new Set([oldCustomerId, customerId ? String(customerId) : null].filter(Boolean));
    for (const cid of customersToSync) {
      await syncCustomerInvoices(cid);
    }

    const out = await Invoice.findById(inv._id).populate("customer", "fullName phone address notes").lean();
    await attachCreditMetaToInvoice(out);
    await attachPaymentsRecordedToInvoices([out]);
    attachDeliverySummaryToInvoices([out]);
    res.json(out);
  }
);

router.patch(
  "/:id/delivery",
  body("delivered").isBoolean(),
  body("lineItemId").optional().isString().notEmpty(),
  body("all").optional().isBoolean(),
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

    const { lineItemId, delivered, all } = req.body;
    if (all === true) {
      const now = delivered ? new Date() : null;
      for (const li of inv.lineItems) {
        li.delivered = Boolean(delivered);
        li.deliveredAt = li.delivered ? now : null;
      }
    } else if (lineItemId) {
      const li = inv.lineItems.id(lineItemId);
      if (!li) return res.status(404).json({ message: "Line item not found" });
      li.delivered = Boolean(delivered);
      li.deliveredAt = li.delivered ? new Date() : null;
    } else {
      return res.status(400).json({ message: "Provide lineItemId or all: true" });
    }

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

  const customerId = inv.customer;

  await Promise.all([
    inv.creditEntry ? CreditEntry.findByIdAndDelete(inv.creditEntry) : Promise.resolve(),
    PaymentEntry.deleteMany({ invoice: inv._id }),
    Invoice.findByIdAndDelete(inv._id),
  ]);
  if (customerId) await syncCustomerInvoices(customerId);
  res.status(204).send();
});

export default router;
