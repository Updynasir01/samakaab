import { Router } from "express";
import { authRequired, adminOnly } from "../middleware/auth.js";
import { buildBackupPayload } from "../services/backupExport.js";

const router = Router();

router.get("/", authRequired, adminOnly, async (_req, res) => {
  const payload = await buildBackupPayload();
  res.json(payload);
});

export default router;
