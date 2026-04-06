import { Router } from "express";
import mongoose from "mongoose";
import { body, query, validationResult } from "express-validator";
import Customer from "../models/Customer.js";
import CreditEntry from "../models/CreditEntry.js";
import PaymentEntry from "../models/PaymentEntry.js";
import Invoice from "../models/Invoice.js";
import { authRequired, adminOnly } from "../middleware/auth.js";
import { getCustomerBalance, getBalancesForCustomers } from "../services/balance.js";

const router = Router();
router.use(authRequired);

router.get(
  "/",
  query("q").optional().trim(),
  query("minBalance").optional().isFloat({ min: 0 }),
  query("hasDebt").optional().isIn(["true", "false"]),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { q, minBalance, hasDebt } = req.query;
    let filter = {};
    if (q && String(q).trim()) {
      const term = String(q).trim();
      const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter = {
        $or: [{ fullName: { $regex: rx } }, { phone: { $regex: rx } }, { notes: { $regex: rx } }],
      };
    }
    let customers = await Customer.find(filter).sort({ fullName: 1 }).lean();
    const ids = customers.map((c) => c._id);
    const balances = await getBalancesForCustomers(ids);
    let rows = customers.map((c) => {
      const b = balances.get(String(c._id)) || {
        totalCredit: 0,
        totalPayments: 0,
        balance: 0,
      };
      return {
        ...c,
        totalCredit: b.totalCredit,
        totalPayments: b.totalPayments,
        balance: b.balance,
      };
    });
    if (hasDebt === "true") {
      rows = rows.filter((r) => r.balance > 0);
    }
    if (minBalance != null && minBalance !== "") {
      const m = Number(minBalance);
      rows = rows.filter((r) => r.balance >= m);
    }
    res.json(rows);
  }
);

router.get("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid id" });
  }
  const customer = await Customer.findById(req.params.id).lean();
  if (!customer) return res.status(404).json({ message: "Customer not found" });
  const bal = await getCustomerBalance(customer._id);
  res.json({ ...customer, ...bal });
});

router.post(
  "/",
  body("fullName").trim().notEmpty(),
  body("phone").trim().notEmpty(),
  body("address").optional().trim(),
  body("notes").optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Invalid input", errors: errors.array() });
    }
    const c = await Customer.create(req.body);
    res.status(201).json(c);
  }
);

router.patch(
  "/:id",
  body("fullName").optional().trim().notEmpty(),
  body("phone").optional().trim().notEmpty(),
  body("address").optional().trim(),
  body("notes").optional().trim(),
  async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  }
);

router.delete("/:id", adminOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid id" });
  }
  const id = req.params.id;
  await Promise.all([
    CreditEntry.deleteMany({ customer: id }),
    PaymentEntry.deleteMany({ customer: id }),
    Invoice.deleteMany({ customer: id }),
    Customer.findByIdAndDelete(id),
  ]);
  res.status(204).send();
});

export default router;
