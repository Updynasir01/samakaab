import { createRequire } from "module";
import { PassThrough } from "stream";
import { buildBackupPayload } from "./backupExport.js";

const require = createRequire(import.meta.url);
const archiver = require("archiver");

function readmeText(meta) {
  return `Samakaab Supermarket — data backup
Exported: ${meta.exportedAt}
Customers: ${meta.counts.customers}
Invoices: ${meta.counts.invoices}
Credits: ${meta.counts.credits}
Payments: ${meta.counts.payments}

Files in this ZIP:
  - samakaab-backup-*.json  (full data for recovery)
  - customers.csv, invoices.csv, credits.csv, payments.csv  (Excel)

User passwords are NOT included. After restore, reset passwords in Settings.

Keep this file private — it contains real business and financial data.
`;
}

/** Build a ZIP buffer containing JSON + CSV exports. */
export async function buildBackupZipBuffer() {
  const payload = await buildBackupPayload();
  const stamp = payload.meta.exportedAt.slice(0, 10);
  const { csv, ...jsonBody } = payload;

  return new Promise((resolve, reject) => {
    const chunks = [];
    const out = new PassThrough();
    out.on("data", (c) => chunks.push(c));
    out.on("end", () => resolve({ buffer: Buffer.concat(chunks), stamp, meta: payload.meta }));
    out.on("error", reject);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", reject);
    archive.pipe(out);

    archive.append(JSON.stringify(jsonBody, null, 2), { name: `samakaab-backup-${stamp}.json` });
    const bom = "\uFEFF";
    for (const [name, text] of Object.entries(csv)) {
      archive.append(bom + text, { name: `${name}.csv` });
    }
    archive.append(readmeText(payload.meta), { name: "README.txt" });
    archive.finalize();
  });
}

export function backupZipFilename(stamp) {
  return `samakaab-backup-${stamp}.zip`;
}
