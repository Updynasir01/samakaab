import mongoose from "mongoose";

const accountPersonSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: "" },
    note: { type: String, trim: true, default: "" },
    createdBy: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

accountPersonSchema.index({ name: 1 });

export default mongoose.model("AccountPerson", accountPersonSchema);
