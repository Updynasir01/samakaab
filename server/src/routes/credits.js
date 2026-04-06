import { Router } from "express";
import mongoose from "mongoose";
import { body, query, validationResult } from "express-validator";
import CreditEntry from "../models/CreditEntry.js";
import Customer from "../models/Customer.js";
import { authRequired, adminOnly } from "../middleware/auth.js";

const router = Router();
router.use(authRequired);

router.get(
  "/search",
  query("q").trim().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Query required" });
    }
    const rx = new RegExp(req.query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const list = await CreditEntry.find({ description: { $regex: rx } })
      .populate("customer", "fullName phone")
      .sort({ dateOfCredit: -1 })
      .limit(100)
      .lean();
    res.json(list);
  }
);

router.get("/customer/:customerId", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.customerId)) {
    return res.status(400).json({ message: "Invalid customer id" });
  }
  const list = await CreditEntry.find({ customer: req.params.customerId })
    .sort({ dateOfCredit: -1 })
    .lean();
  res.json(list);
});

router.post(
  "/",
  body("customer").isMongoId(),
  body("amount").isFloat({ min: 0 }),
  body("description").trim().notEmpty(),
  body("dateOfCredit").isISO8601(),
  body("expectedPayDate").isISO8601(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Invalid input", errors: errors.array() });
    }
    const exists = await Customer.findById(req.body.customer);
    if (!exists) return res.status(404).json({ message: "Customer not found" });
    const entry = await CreditEntry.create({
      ...req.body,
      dateOfCredit: new Date(req.body.dateOfCredit),
      expectedPayDate: new Date(req.body.expectedPayDate),
    });
    res.status(201).json(entry);
  }
);

router.delete("/:id", adminOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid id" });
  }
  const d = await CreditEntry.findByIdAndDelete(req.params.id);
  if (!d) return res.status(404).json({ message: "Not found" });
  res.status(204).send();
});

export default router;
