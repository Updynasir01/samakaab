import mongoose from "mongoose";

export const INVENTORY_UNITS = ["bottle", "box", "kg", "piece"];

const inventoryProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    unit: { type: String, enum: INVENTORY_UNITS, required: true, default: "piece" },
    /** Optional sell / shelf price for reference */
    sellPrice: { type: Number, min: 0, default: 0 },
    /** Alert when remaining qty is at or below this */
    lowStockThreshold: { type: Number, min: 0, default: 10 },
    note: { type: String, trim: true, default: "" },
    active: { type: Boolean, default: true },
    createdBy: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

inventoryProductSchema.index({ name: "text" });
inventoryProductSchema.index({ active: 1, name: 1 });

export default mongoose.model("InventoryProduct", inventoryProductSchema);
