import "dotenv/config";
import mongoose from "mongoose";
import { syncAllInvoiceStatuses } from "./services/invoiceSync.js";

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/samakaab";

async function main() {
  await mongoose.connect(uri);
  const r = await syncAllInvoiceStatuses();
  console.log("Invoice sync:", r);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
