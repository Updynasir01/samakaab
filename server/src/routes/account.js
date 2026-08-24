import { Router } from "express";
import mongoose from "mongoose";
import { body, param, query, validationResult } from "express-validator";
import AccountEntry from "../models/AccountEntry.js";
import AccountPerson from "../models/AccountPerson.js";
import { authRequired, adminOnly, actorUsername } from "../middleware/auth.js";

const router = Router();
router.use(authRequired);

const UNASSIGNED_ID = "unassigned";

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

function personFilter(personId) {
  if (personId === UNASSIGNED_ID) return { $or: [{ person: null }, { person: { $exists: false } }] };
  return { person: personId };
}

function parseRange(req) {
  let from = req.query.from ? new Date(req.query.from) : null;
  let to = req.query.to ? new Date(req.query.to) : null;
  if (from && Number.isNaN(from.getTime())) from = null;
  if (to && Number.isNaN(to.getTime())) to = null;
  if (to) to.setHours(23, 59, 59, 999);
  return { from, to };
}

function statementFromEntries(all, from, to) {
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
  return {
    previousBalance,
    entries: rows,
    totals: {
      debit: round2(rows.reduce((s, r) => s + r.debit, 0)),
      credit: round2(rows.reduce((s, r) => s + r.credit, 0)),
      balance: lastBalance,
    },
  };
}

async function balancesByPerson() {
  const agg = await AccountEntry.aggregate([
    {
      $group: {
        _id: { $ifNull: ["$person", UNASSIGNED_ID] },
        credit: {
          $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0] },
        },
        debit: {
          $sum: { $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0] },
        },
      },
    },
  ]);
  const map = new Map();
  for (const r of agg) {
    map.set(String(r._id), {
      credit: round2(r.credit),
      debit: round2(r.debit),
      balance: round2(r.credit - r.debit),
    });
  }
  return map;
}

router.get("/people", query("q").optional().trim(), async (req, res) => {
  const q = String(req.query.q || "").trim();
  const filter = q
    ? {
        $or: [
          { name: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
          { phone: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
        ],
      }
    : {};
  const people = await AccountPerson.find(filter).sort({ name: 1 }).lean();
  const bal = await balancesByPerson();
  const list = people.map((p) => {
    const b = bal.get(String(p._id)) || { credit: 0, debit: 0, balance: 0 };
    return { ...p, ...b };
  });
  const unassigned = bal.get(UNASSIGNED_ID);
  if (unassigned && !q) {
    list.unshift({
      _id: UNASSIGNED_ID,
      name: "Unassigned",
      phone: "",
      note: "Entries recorded before people were added",
      ...unassigned,
      unassigned: true,
    });
  }
  res.json(list);
});

router.post(
  "/people",
  body("name").trim().notEmpty(),
  body("phone").optional().trim(),
  body("note").optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: "Invalid input", errors: errors.array() });
    const person = await AccountPerson.create({
      name: String(req.body.name).trim(),
      phone: String(req.body.phone || "").trim(),
      note: String(req.body.note || "").trim(),
      createdBy: actorUsername(req),
    });
    res.status(201).json({ ...person.toObject(), credit: 0, debit: 0, balance: 0 });
  }
);

router.get("/people/:id", param("id").notEmpty(), async (req, res) => {
  const id = req.params.id;
  if (id === UNASSIGNED_ID) {
    return res.json({
      _id: UNASSIGNED_ID,
      name: "Unassigned",
      phone: "",
      note: "Entries recorded before people were added",
      unassigned: true,
    });
  }
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });
  const person = await AccountPerson.findById(id).lean();
  if (!person) return res.status(404).json({ message: "Person not found" });
  res.json(person);
});

router.patch(
  "/people/:id",
  param("id").isMongoId(),
  body("name").optional().trim().notEmpty(),
  body("phone").optional().trim(),
  body("note").optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: "Invalid input", errors: errors.array() });
    const person = await AccountPerson.findById(req.params.id);
    if (!person) return res.status(404).json({ message: "Person not found" });
    if (req.body.name != null) person.name = String(req.body.name).trim();
    if (req.body.phone != null) person.phone = String(req.body.phone).trim();
    if (req.body.note != null) person.note = String(req.body.note).trim();
    await person.save();
    res.json(person);
  }
);

router.delete("/people/:id", adminOnly, param("id").isMongoId(), async (req, res) => {
  const person = await AccountPerson.findById(req.params.id);
  if (!person) return res.status(404).json({ message: "Person not found" });
  const count = await AccountEntry.countDocuments({ person: person._id });
  if (count > 0) {
    return res.status(400).json({ message: "Delete this person’s transactions first, or keep the account." });
  }
  await AccountPerson.deleteOne({ _id: person._id });
  res.json({ ok: true });
});

router.get(
  "/people/:id/entries",
  param("id").notEmpty(),
  query("from").optional().isISO8601(),
  query("to").optional().isISO8601(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: "Invalid input", errors: errors.array() });
    const id = req.params.id;
    if (id !== UNASSIGNED_ID && !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const { from, to } = parseRange(req);
    const all = await AccountEntry.find(personFilter(id)).sort({ date: 1, createdAt: 1, transNo: 1 }).lean();
    res.json(statementFromEntries(all, from, to));
  }
);

router.post(
  "/entries",
  body("person").isMongoId(),
  body("type").isIn(["credit", "debit"]),
  body("amount").isFloat({ gt: 0 }),
  body("date").isISO8601(),
  body("description").optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: "Invalid input", errors: errors.array() });
    const person = await AccountPerson.findById(req.body.person);
    if (!person) return res.status(404).json({ message: "Person not found" });

    const entry = await AccountEntry.create({
      person: person._id,
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

router.delete("/entries/:id", adminOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid id" });
  }
  const d = await AccountEntry.findByIdAndDelete(req.params.id);
  if (!d) return res.status(404).json({ message: "Not found" });
  res.json({ ok: true });
});

export default router;
