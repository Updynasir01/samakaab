import mongoose from "mongoose";

const creditEntrySchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, required: true, trim: true },
    dateOfCredit: { type: Date, required: true },
    expectedPayDate: { type: Date, required: true },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", default: null },
  },
  { timestamps: true }
);

creditEntrySchema.index({ customer: 1, dateOfCredit: -1 });

export default mongoose.model("CreditEntry", creditEntrySchema);
