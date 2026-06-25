import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { buildBackupPayload } from "./services/backupExport.js";

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/samakaab";
const outDir = process.argv[2] || path.join(process.cwd(), "backups");

async function main() {
  await mongoose.connect(uri);
  const payload = await buildBackupPayload();
  const stamp = payload.meta.exportedAt.slice(0, 10);
  const folder = path.join(outDir, `samakaab-${stamp}`);
  fs.mkdirSync(folder, { recursive: true });

  fs.writeFileSync(path.join(folder, "samakaab-backup.json"), JSON.stringify(payload, null, 2), "utf8");
  const bom = "\uFEFF";
  for (const [name, text] of Object.entries(payload.csv)) {
    fs.writeFileSync(path.join(folder, `${name}.csv`), bom + text, "utf8");
  }

  console.log(`Backup saved to ${folder}`);
  console.log(`  JSON + ${Object.keys(payload.csv).length} CSV files`);
  console.log(`  Customers: ${payload.meta.counts.customers}, Invoices: ${payload.meta.counts.invoices}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
