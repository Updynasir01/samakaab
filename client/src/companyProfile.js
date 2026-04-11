/** Defaults used before API load and as merge fallbacks. */
export const DEFAULT_COMPANY = {
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

/** @deprecated use DEFAULT_COMPANY */
export const COMPANY = DEFAULT_COMPANY;

/**
 * Merge API payload with defaults (safe for partial/null).
 * @param {object|null|undefined} api
 */
export function mergeCompanyProfile(api) {
  if (!api || typeof api !== "object") {
    return {
      ...DEFAULT_COMPANY,
      bank: { ...DEFAULT_COMPANY.bank },
      terms: { ...DEFAULT_COMPANY.terms, lines: [...DEFAULT_COMPANY.terms.lines] },
    };
  }
  const lines = Array.isArray(api.terms?.lines) ? [...api.terms.lines] : [...DEFAULT_COMPANY.terms.lines];
  return {
    systemTitle: api.systemTitle || DEFAULT_COMPANY.systemTitle,
    brandName: api.brandName || DEFAULT_COMPANY.brandName,
    legalName: api.legalName || DEFAULT_COMPANY.legalName,
    addressLines: Array.isArray(api.addressLines) ? [...api.addressLines] : [...DEFAULT_COMPANY.addressLines],
    phone: api.phone ?? DEFAULT_COMPANY.phone,
    email: api.email ?? DEFAULT_COMPANY.email,
    logoDataUrl: typeof api.logoDataUrl === "string" && api.logoDataUrl.startsWith("data:image/") ? api.logoDataUrl : "",
    bank: { ...DEFAULT_COMPANY.bank, ...(api.bank || {}) },
    terms: {
      title: api.terms?.title || DEFAULT_COMPANY.terms.title,
      lines,
    },
  };
}

export function companyMetaLine(company = DEFAULT_COMPANY) {
  const c = company || DEFAULT_COMPANY;
  return [c.legalName, c.phone ? `Phone: ${c.phone}` : null, c.email ? `Email: ${c.email}` : null].filter(Boolean).join(" · ");
}
