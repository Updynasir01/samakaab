import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import authRoutes from "./routes/auth.js";
import customerRoutes from "./routes/customers.js";
import creditRoutes from "./routes/credits.js";
import paymentRoutes from "./routes/payments.js";
import reportRoutes from "./routes/reports.js";
import dashboardRoutes from "./routes/dashboard.js";
import invoiceRoutes from "./routes/invoices.js";
import settingsRoutes from "./routes/settings.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/credits", creditRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/settings", settingsRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "Samakaab Supermarket API" });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    message: err.message || "Server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/samakaab";

mongoose
  .connect(uri)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`API http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error("MongoDB connection failed:", e.message);
    process.exit(1);
  });
