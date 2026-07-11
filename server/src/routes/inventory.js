import { Router } from "express";
import mongoose from "mongoose";
import { body, param, query, validationResult } from "express-validator";
import InventoryProduct, { INVENTORY_UNITS } from "../models/InventoryProduct.js";
import InventoryBatch from "../models/InventoryBatch.js";
import InventoryMovement from "../models/InventoryMovement.js";
import { authRequired, adminOnly, actorUsername } from "../middleware/auth.js";

const router = Router();
router.use(authRequired);

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function EPS() {
  return 0.0005;
}

async function remainingForProduct(productId) {
  const agg = await InventoryBatch.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(productId), quantityRemaining: { $gt: 0 } } },
    { $group: { _id: null, total: { $sum: "$quantityRemaining" } } },
  ]);
  return round2(agg[0]?.total || 0);
}

async function attachProductStats(products) {
  const ids = products.map((p) => p._id);
  if (!ids.length) return products.map((p) => ({ ...p, quantityRemaining: 0, nearestExpiry: null, lowStock: false }));

  const [qtyAgg, expiryAgg] = await Promise.all([
    InventoryBatch.aggregate([
      { $match: { product: { $in: ids }, quantityRemaining: { $gt: 0 } } },
      { $group: { _id: "$product", total: { $sum: "$quantityRemaining" } } },
    ]),
    InventoryBatch.aggregate([
      {
        $match: {
          product: { $in: ids },
          quantityRemaining: { $gt: 0 },
          expiryDate: { $ne: null },
        },
      },
      { $sort: { expiryDate: 1 } },
      {
        $group: {
          _id: "$product",
          nearestExpiry: { $first: "$expiryDate" },
        },
      },
    ]),
  ]);

  const qtyMap = new Map(qtyAgg.map((r) => [String(r._id), round2(r.total)]));
  const expMap = new Map(expiryAgg.map((r) => [String(r._id), r.nearestExpiry]));

  return products.map((p) => {
    const quantityRemaining = qtyMap.get(String(p._id)) || 0;
    const threshold = Number(p.lowStockThreshold ?? 0);
    return {
      ...p,
      quantityRemaining,
      nearestExpiry: expMap.get(String(p._id)) || null,
      lowStock: threshold > 0 && quantityRemaining <= threshold,
    };
  });
}

/** Deduct qty from batches — soonest expiry first (FIFO). */
async function deductFifo(productId, qty) {
  let left = round2(qty);
  const batches = await InventoryBatch.find({
    product: productId,
    quantityRemaining: { $gt: 0 },
  }).lean();

  batches.sort((a, b) => {
    if (!a.expiryDate && !b.expiryDate) {
      return new Date(a.receivedAt) - new Date(b.receivedAt);
    }
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    const d = new Date(a.expiryDate) - new Date(b.expiryDate);
    if (d !== 0) return d;
    return new Date(a.receivedAt) - new Date(b.receivedAt);
  });

  for (const b of batches) {
    if (left <= EPS()) break;
    const take = Math.min(round2(b.quantityRemaining), left);
    const next = round2(b.quantityRemaining - take);
    await InventoryBatch.updateOne({ _id: b._id }, { $set: { quantityRemaining: next } });
    left = round2(left - take);
  }

  if (left > EPS()) {
    const err = new Error(`Not enough stock. Short by ${left}.`);
    err.status = 400;
    throw err;
  }
}

router.get("/units", (_req, res) => {
  res.json({ units: INVENTORY_UNITS });
});

router.get(
  "/products",
  query("q").optional().trim(),
  async (req, res) => {
    const filter = { active: true };
    const needle = String(req.query.q || "").trim();
    if (needle) {
      filter.name = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }
    const list = await InventoryProduct.find(filter).sort({ name: 1 }).lean();
    res.json(await attachProductStats(list));
  }
);

router.post(
  "/products",
  body("name").trim().notEmpty(),
  body("unit").isIn(INVENTORY_UNITS),
  body("sellPrice").optional().isFloat({ min: 0 }),
  body("lowStockThreshold").optional().isFloat({ min: 0 }),
  body("note").optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: "Invalid input", errors: errors.array() });

    const product = await InventoryProduct.create({
      name: String(req.body.name).trim(),
      unit: req.body.unit,
      sellPrice: round2(req.body.sellPrice ?? 0),
      lowStockThreshold: round2(req.body.lowStockThreshold ?? 10),
      note: String(req.body.note || "").trim(),
      createdBy: actorUsername(req),
    });
    const lean = product.toObject();
    res.status(201).json({ ...lean, quantityRemaining: 0, nearestExpiry: null, lowStock: false });
  }
);

router.patch(
  "/products/:id",
  param("id").isMongoId(),
  body("name").optional().trim().notEmpty(),
  body("unit").optional().isIn(INVENTORY_UNITS),
  body("sellPrice").optional().isFloat({ min: 0 }),
  body("lowStockThreshold").optional().isFloat({ min: 0 }),
  body("note").optional().trim(),
  body("active").optional().isBoolean(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: "Invalid input", errors: errors.array() });

    const product = await InventoryProduct.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    if (req.body.name != null) product.name = String(req.body.name).trim();
    if (req.body.unit != null) product.unit = req.body.unit;
    if (req.body.sellPrice != null) product.sellPrice = round2(req.body.sellPrice);
    if (req.body.lowStockThreshold != null) product.lowStockThreshold = round2(req.body.lowStockThreshold);
    if (req.body.note != null) product.note = String(req.body.note).trim();
    if (req.body.active != null) product.active = Boolean(req.body.active);
    await product.save();

    const [withStats] = await attachProductStats([product.toObject()]);
    res.json(withStats);
  }
);

router.delete("/products/:id", adminOnly, param("id").isMongoId(), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid id" });
  }
  const product = await InventoryProduct.findById(req.params.id);
  if (!product) return res.status(404).json({ message: "Product not found" });
  product.active = false;
  await product.save();
  res.json({ ok: true });
});

router.get("/products/:id/batches", param("id").isMongoId(), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid id" });
  }
  const batches = await InventoryBatch.find({
    product: req.params.id,
    quantityRemaining: { $gt: 0 },
  })
    .sort({ expiryDate: 1, receivedAt: 1 })
    .lean();
  res.json(batches);
});

router.get(
  "/products/:id/movements",
  param("id").isMongoId(),
  query("limit").optional().isInt({ min: 1, max: 200 }),
  async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const limit = Number(req.query.limit) || 50;
    const list = await InventoryMovement.find({ product: req.params.id })
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(list);
  }
);

router.post(
  "/products/:id/stock-in",
  param("id").isMongoId(),
  body("quantity").isFloat({ gt: 0 }),
  body("unitCost").optional().isFloat({ min: 0 }),
  body("expiryDate").optional({ nullable: true }).isISO8601(),
  body("supplier").optional().trim(),
  body("receivedAt").optional().isISO8601(),
  body("note").optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: "Invalid input", errors: errors.array() });

    const product = await InventoryProduct.findById(req.params.id);
    if (!product || !product.active) return res.status(404).json({ message: "Product not found" });

    const quantity = round2(req.body.quantity);
    const unitCost = round2(req.body.unitCost ?? 0);
    const supplier = String(req.body.supplier || "").trim();
    const note = String(req.body.note || "").trim();
    const receivedAt = req.body.receivedAt ? new Date(req.body.receivedAt) : new Date();
    const expiryDate = req.body.expiryDate ? new Date(req.body.expiryDate) : null;
    const enteredBy = actorUsername(req);

    const batch = await InventoryBatch.create({
      product: product._id,
      quantityReceived: quantity,
      quantityRemaining: quantity,
      unitCost,
      expiryDate,
      supplier,
      receivedAt,
      note,
      createdBy: enteredBy,
    });

    await InventoryMovement.create({
      product: product._id,
      type: "in",
      quantity,
      batch: batch._id,
      date: receivedAt,
      note,
      supplier,
      createdBy: enteredBy,
    });

    const [withStats] = await attachProductStats([product.toObject()]);
    res.status(201).json({ product: withStats, batch });
  }
);

router.post(
  "/products/:id/sold",
  param("id").isMongoId(),
  body("quantity").isFloat({ gt: 0 }),
  body("date").optional().isISO8601(),
  body("note").optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: "Invalid input", errors: errors.array() });

    const product = await InventoryProduct.findById(req.params.id);
    if (!product || !product.active) return res.status(404).json({ message: "Product not found" });

    const quantity = round2(req.body.quantity);
    const onHand = await remainingForProduct(product._id);
    if (quantity > onHand + EPS()) {
      return res.status(400).json({
        message: `Cannot record ${quantity} sold — only ${onHand} remaining.`,
      });
    }

    try {
      await deductFifo(product._id, quantity);
    } catch (e) {
      return res.status(e.status || 400).json({ message: e.message });
    }

    const date = req.body.date ? new Date(req.body.date) : new Date();
    await InventoryMovement.create({
      product: product._id,
      type: "sold",
      quantity,
      date,
      note: String(req.body.note || "").trim() || "Closing / sold",
      createdBy: actorUsername(req),
    });

    const [withStats] = await attachProductStats([product.toObject()]);
    res.json({ product: withStats });
  }
);

router.post(
  "/products/:id/adjust",
  param("id").isMongoId(),
  body("quantity").isFloat({ gt: 0 }),
  body("date").optional().isISO8601(),
  body("note").optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: "Invalid input", errors: errors.array() });

    const product = await InventoryProduct.findById(req.params.id);
    if (!product || !product.active) return res.status(404).json({ message: "Product not found" });

    const quantity = round2(req.body.quantity);
    const onHand = await remainingForProduct(product._id);
    if (quantity > onHand + EPS()) {
      return res.status(400).json({
        message: `Cannot adjust out ${quantity} — only ${onHand} remaining.`,
      });
    }

    try {
      await deductFifo(product._id, quantity);
    } catch (e) {
      return res.status(e.status || 400).json({ message: e.message });
    }

    const date = req.body.date ? new Date(req.body.date) : new Date();
    await InventoryMovement.create({
      product: product._id,
      type: "adjust",
      quantity,
      date,
      note: String(req.body.note || "").trim() || "Adjustment (breakage / loss)",
      createdBy: actorUsername(req),
    });

    const [withStats] = await attachProductStats([product.toObject()]);
    res.json({ product: withStats });
  }
);

export default router;
