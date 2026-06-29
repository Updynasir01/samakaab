import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { buildBackupZipBuffer, backupZipFilename } from "./services/backupZip.js";

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/samakaab";
const outDir = process.argv[2] || path.join(process.cwd(), "backups");

async function main() {
  await mongoose.connect(uri);
  const { buffer, stamp, meta } = await buildBackupZipBuffer();
  const folder = path.join(outDir, `samakaab-${stamp}`);
  fs.mkdirSync(folder, { recursive: true });
  const zipPath = path.join(folder, backupZipFilename(stamp));
  fs.writeFileSync(zipPath, buffer);
  console.log(`Backup ZIP saved: ${zipPath}`);
  console.log(`  ${meta.counts.customers} customers, ${meta.counts.invoices} invoices`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
