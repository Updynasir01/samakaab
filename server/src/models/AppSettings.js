import mongoose from "mongoose";

const bankSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    bankName: { type: String, default: "" },
    accountName: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    swiftCode: { type: String, default: "" },
  },
  { _id: false }
);

const termsSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    lines: { type: [String], default: [] },
  },
  { _id: false }
);

/** Singleton document: only one row for company / branding. */
const appSettingsSchema = new mongoose.Schema(
  {
    systemTitle: { type: String, default: "Samakaab" },
    brandName: { type: String, default: "Samakaab" },
    legalName: { type: String, default: "SAMKAB GENERAL TRADING CO. LTD" },
    addressLines: { type: [String], default: [] },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    /** data:image/png;base64,... — optional logo for prints */
    logoDataUrl: { type: String, default: "" },
    bank: { type: bankSchema, default: () => ({}) },
    terms: { type: termsSchema, default: () => ({}) },
    onedrive: {
      refreshToken: { type: String, default: "" },
      accountEmail: { type: String, default: "" },
      connectedAt: { type: Date, default: null },
      folderName: { type: String, default: "SamakaabBackups" },
      schedule: { type: String, enum: ["off", "weekly", "monthly"], default: "off" },
      lastBackupAt: { type: Date, default: null },
      lastBackupFile: { type: String, default: "" },
      lastBackupError: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

export default mongoose.model("AppSettings", appSettingsSchema);
