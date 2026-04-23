import { Router } from "express";
import { body, validationResult } from "express-validator";
import AppSettings from "../models/AppSettings.js";
import { authRequired, adminOnly } from "../middleware/auth.js";

const router = Router();

const DEFAULTS = {
  systemTitle: "Samakaab",
  brandName: "Samakaab",
  legalName: "SAMKAB GENERAL TRADING CO. LTD",
  addressLines: ["FREEDOM SQUARE", "KONYO KONYO MARKET, SHOP NO {1}", "Juba, South Sudan"],
  phone: "+211922225008",
  email: "samkabgeneral@gmail.com",
  logoDataUrl: "",
  bank: {
    title: "Money transfer to the account below:",
    bankName: "Ecobank South Sudan",
    accountName: "SAMKAB GENERAL TRADING CO. LTD",
    accountNumber: "6940001302",
    swiftCode: "ECOCSSJB",
  },
  terms: {
    title: "Terms & Conditions:",
    lines: ["Payment period is 30 days max.", "We accept cash or bank transfer."],
  },
};

function mergeWithDefaults(doc) {
  const o = doc?.toObject?.() || doc || {};
  return {
    systemTitle: o.systemTitle ?? DEFAULTS.systemTitle,
    brandName: o.brandName ?? DEFAULTS.brandName,
    legalName: o.legalName ?? DEFAULTS.legalName,
    addressLines: Array.isArray(o.addressLines) ? o.addressLines : [...DEFAULTS.addressLines],
    phone: o.phone ?? DEFAULTS.phone,
    email: o.email ?? DEFAULTS.email,
    logoDataUrl: typeof o.logoDataUrl === "string" ? o.logoDataUrl : "",
    bank: {
      ...DEFAULTS.bank,
      ...(o.bank || {}),
    },
    terms: {
      title: o.terms?.title ?? DEFAULTS.terms.title,
      lines: Array.isArray(o.terms?.lines) ? o.terms.lines : [...DEFAULTS.terms.lines],
    },
  };
}

async function getOrCreateDoc() {
  let doc = await AppSettings.findOne();
  if (!doc) {
    doc = await AppSettings.create(DEFAULTS);
  }
  return doc;
}

router.get("/company", authRequired, async (_req, res) => {
  const doc = await AppSettings.findOne();
  res.json(mergeWithDefaults(doc));
});

// Public branding endpoint (safe for login screen): no bank/terms/contact details.
router.get("/company-public", async (_req, res) => {
  const doc = await AppSettings.findOne();
  const merged = mergeWithDefaults(doc);
  res.json({
    systemTitle: merged.systemTitle,
    brandName: merged.brandName,
    logoDataUrl: merged.logoDataUrl,
  });
});

router.patch(
  "/company",
  authRequired,
  adminOnly,
  body("systemTitle").optional().isString(),
  body("brandName").optional().isString(),
  body("legalName").optional().isString(),
  body("addressLines").optional().isArray(),
  body("addressLines.*").optional().isString(),
  body("phone").optional().isString(),
  body("email").optional().isString(),
  body("logoDataUrl").optional().isString(),
  body("bank").optional().isObject(),
  body("terms").optional().isObject(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Invalid input", errors: errors.array() });
    }

    const logo = req.body.logoDataUrl;
    if (typeof logo === "string" && logo.length > 600_000) {
      return res.status(400).json({ message: "Logo image is too large (max ~500KB after encoding)." });
    }

    const doc = await getOrCreateDoc();

    const b = req.body;
    if (b.systemTitle != null) doc.systemTitle = String(b.systemTitle).trim().slice(0, 120);
    if (b.brandName != null) doc.brandName = String(b.brandName).trim().slice(0, 200);
    if (b.legalName != null) doc.legalName = String(b.legalName).trim().slice(0, 200);
    if (Array.isArray(b.addressLines)) {
      doc.addressLines = b.addressLines.map((x) => String(x).trim()).filter(Boolean).slice(0, 20);
    }
    if (b.phone != null) doc.phone = String(b.phone).trim().slice(0, 80);
    if (b.email != null) doc.email = String(b.email).trim().slice(0, 120);
    if (b.logoDataUrl !== undefined) {
      doc.logoDataUrl = typeof b.logoDataUrl === "string" && b.logoDataUrl.startsWith("data:image/") ? b.logoDataUrl : "";
    }

    if (b.bank && typeof b.bank === "object") {
      doc.bank = doc.bank || {};
      const bk = b.bank;
      if (bk.title != null) doc.bank.title = String(bk.title).trim().slice(0, 200);
      if (bk.bankName != null) doc.bank.bankName = String(bk.bankName).trim().slice(0, 200);
      if (bk.accountName != null) doc.bank.accountName = String(bk.accountName).trim().slice(0, 200);
      if (bk.accountNumber != null) doc.bank.accountNumber = String(bk.accountNumber).trim().slice(0, 80);
      if (bk.swiftCode != null) doc.bank.swiftCode = String(bk.swiftCode).trim().slice(0, 40);
    }

    if (b.terms && typeof b.terms === "object") {
      doc.terms = doc.terms || {};
      if (b.terms.title != null) doc.terms.title = String(b.terms.title).trim().slice(0, 200);
      if (Array.isArray(b.terms.lines)) {
        doc.terms.lines = b.terms.lines.map((x) => String(x).trim()).filter(Boolean).slice(0, 30);
      }
    }

    await doc.save();
    res.json(mergeWithDefaults(doc));
  }
);

export default router;
