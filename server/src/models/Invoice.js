import mongoose from "mongoose";

const lineItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: Number, required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },
    lineItems: [lineItemSchema],
    total: { type: Number, required: true, min: 0 },
    paidAtSale: { type: Number, default: 0, min: 0 },
    /** Amount still on credit after sale (total - paidAtSale) */
    creditAmount: { type: Number, default: 0, min: 0 },
    paymentStatus: { type: String, enum: ["paid", "partial", "unpaid"], required: true },
    date: { type: Date, required: true },
    note: { type: String, trim: true, default: "" },
    creditEntry: { type: mongoose.Schema.Types.ObjectId, ref: "CreditEntry", default: null },
  },
  { timestamps: true }
);

invoiceSchema.index({ customer: 1, date: -1 });
invoiceSchema.index({ date: -1 });

export default mongoose.model("Invoice", invoiceSchema);
