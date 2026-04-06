import mongoose from "mongoose";

const paymentEntrySchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    amount: { type: Number, required: true, min: 0 },
    paidAt: { type: Date, required: true },
    note: { type: String, trim: true, default: "" },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", default: null },
  },
  { timestamps: true }
);

paymentEntrySchema.index({ customer: 1, paidAt: -1 });

export default mongoose.model("PaymentEntry", paymentEntrySchema);
