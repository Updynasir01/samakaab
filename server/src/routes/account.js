import { Router } from "express";
import mongoose from "mongoose";
import { body, query, validationResult } from "express-validator";
import AccountEntry from "../models/AccountEntry.js";
import { authRequired, adminOnly, actorUsername } from "../middleware/auth.js";

const router = Router();
router.use(authRequired);

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

async function nextTransNo() {
  const last = await AccountEntry.findOne().sort({ transNo: -1 }).select("transNo").lean();
  return (last?.transNo || 0) + 1;
}

function signedAmount(entry) {
  const amt = round2(entry.amount);
  return entry.type === "credit" ? amt : -amt;
}

function withRunningBalance(entries, startBalance = 0) {
  let balance = round2(startBalance);
  return entries.map((e) => {
    balance = round2(balance + signedAmount(e));
    return {
      ...e,
      debit: e.type === "debit" ? round2(e.amount) : 0,
      credit: e.type === "credit" ? round2(e.amount) : 0,
      balance,
    };
  });
}

router.get(
  "/",
  query("from").optional().isISO8601(),
  query("to").optional().isISO8601(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: "Invalid input", errors: errors.array() });

    const all = await AccountEntry.find().sort({ date: 1, createdAt: 1, transNo: 1 }).lean();

    let from = req.query.from ? new Date(req.query.from) : null;
    let to = req.query.to ? new Date(req.query.to) : null;
    if (from && Number.isNaN(from.getTime())) from = null;
    if (to && Number.isNaN(to.getTime())) to = null;
    if (to) {
      to.setHours(23, 59, 59, 999);
    }

    const before = from ? all.filter((e) => new Date(e.date) < from) : [];
    const inRange = all.filter((e) => {
      const d = new Date(e.date);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });

    const previousBalance = round2(before.reduce((s, e) => s + signedAmount(e), 0));
    const rows = withRunningBalance(inRange, previousBalance);
    const lastBalance = rows.length ? rows[rows.length - 1].balance : previousBalance;
    const debitTotal = round2(rows.reduce((s, r) => s + r.debit, 0));
    const creditTotal = round2(rows.reduce((s, r) => s + r.credit, 0));

    res.json({
      previousBalance,
      entries: rows,
      totals: {
        debit: debitTotal,
        credit: creditTotal,
        balance: lastBalance,
      },
    });
  }
);

router.post(
  "/",
  body("type").isIn(["credit", "debit"]),
  body("amount").isFloat({ gt: 0 }),
  body("date").isISO8601(),
  body("description").optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: "Invalid input", errors: errors.array() });

    const entry = await AccountEntry.create({
      transNo: await nextTransNo(),
      type: req.body.type,
      amount: round2(req.body.amount),
      date: new Date(req.body.date),
      description: String(req.body.description || "").trim(),
      createdBy: actorUsername(req),
    });

    res.status(201).json(entry);
  }
);

router.delete("/:id", adminOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid id" });
  }
  const d = await AccountEntry.findByIdAndDelete(req.params.id);
  if (!d) return res.status(404).json({ message: "Not found" });
  res.json({ ok: true });
});

export default router;
