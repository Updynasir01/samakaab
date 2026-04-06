import { Router } from "express";
import mongoose from "mongoose";
import { body, validationResult } from "express-validator";
import PaymentEntry from "../models/PaymentEntry.js";
import Customer from "../models/Customer.js";
import { authRequired, adminOnly } from "../middleware/auth.js";
import { closeInvoicesWhenAccountSettled } from "../services/invoiceSync.js";

const router = Router();
router.use(authRequired);

router.get("/customer/:customerId", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.customerId)) {
    return res.status(400).json({ message: "Invalid customer id" });
  }
  const list = await PaymentEntry.find({ customer: req.params.customerId })
    .sort({ paidAt: -1 })
    .lean();
  res.json(list);
});

router.post(
  "/",
  body("customer").isMongoId(),
  body("amount").isFloat({ min: 0 }),
  body("paidAt").isISO8601(),
  body("note").optional().trim(),
  body("invoice").optional({ checkFalsy: true }).isMongoId(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Invalid input", errors: errors.array() });
    }
    const exists = await Customer.findById(req.body.customer);
    if (!exists) return res.status(404).json({ message: "Customer not found" });
    const { invoice, ...rest } = req.body;
    const entry = await PaymentEntry.create({
      ...rest,
      paidAt: new Date(req.body.paidAt),
      ...(invoice ? { invoice } : {}),
    });
    await closeInvoicesWhenAccountSettled(req.body.customer);
    res.status(201).json(entry);
  }
);

router.delete("/:id", adminOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid id" });
  }
  const d = await PaymentEntry.findByIdAndDelete(req.params.id);
  if (!d) return res.status(404).json({ message: "Not found" });
  res.status(204).send();
});

export default router;
