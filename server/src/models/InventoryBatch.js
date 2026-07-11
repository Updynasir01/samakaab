import mongoose from "mongoose";

/** One delivery / stock-in lot (expiry tracked per batch). */
const inventoryBatchSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryProduct", required: true, index: true },
    quantityReceived: { type: Number, required: true, min: 0 },
    quantityRemaining: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, min: 0, default: 0 },
    expiryDate: { type: Date, default: null },
    supplier: { type: String, trim: true, default: "" },
    receivedAt: { type: Date, required: true },
    note: { type: String, trim: true, default: "" },
    createdBy: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

inventoryBatchSchema.index({ product: 1, quantityRemaining: 1, expiryDate: 1 });

export default mongoose.model("InventoryBatch", inventoryBatchSchema);
