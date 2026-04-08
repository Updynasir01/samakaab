export const COMPANY = {
  brandName: "Samakaab",
  legalName: "SAMKAB GENERAL TRADING CO. LTD",
  addressLines: ["FREEDOM SQUARE", "KONYO KONYO MARKET, SHOP NO {1}", "Juba, South Sudan"],
  phone: "+211922225008",
  email: "samkabgeneral@gmail.com",
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

export function companyMetaLine() {
  const parts = [COMPANY.legalName, COMPANY.phone ? `Phone: ${COMPANY.phone}` : null, COMPANY.email ? `Email: ${COMPANY.email}` : null]
    .filter(Boolean)
    .join(" · ");
  return parts;
}

