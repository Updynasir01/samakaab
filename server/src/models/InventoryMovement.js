import mongoose from "mongoose";

const inventoryMovementSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryProduct", required: true, index: true },
    type: { type: String, enum: ["in", "sold", "adjust"], required: true },
    quantity: { type: Number, required: true, min: 0 },
    /** For type "in" — the batch created */
    batch: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryBatch", default: null },
    date: { type: Date, required: true },
    note: { type: String, trim: true, default: "" },
    supplier: { type: String, trim: true, default: "" },
    createdBy: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

inventoryMovementSchema.index({ product: 1, date: -1 });

export default mongoose.model("InventoryMovement", inventoryMovementSchema);
