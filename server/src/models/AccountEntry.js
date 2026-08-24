import mongoose from "mongoose";

const accountEntrySchema = new mongoose.Schema(
  {
    person: { type: mongoose.Schema.Types.ObjectId, ref: "AccountPerson", default: null, index: true },
    transNo: { type: Number, required: true, unique: true },
    /** credit = record (money in), debit = remove (money out) */
    type: { type: String, enum: ["credit", "debit"], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    date: { type: Date, required: true },
    description: { type: String, trim: true, default: "" },
    createdBy: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

accountEntrySchema.index({ person: 1, date: 1, createdAt: 1 });
accountEntrySchema.index({ date: 1, createdAt: 1 });

export default mongoose.model("AccountEntry", accountEntrySchema);
