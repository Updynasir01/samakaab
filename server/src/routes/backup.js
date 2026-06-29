import { Router } from "express";
import { body, validationResult } from "express-validator";
import { authRequired, adminOnly } from "../middleware/auth.js";
import { buildBackupPayload } from "../services/backupExport.js";
import { buildBackupZipBuffer, backupZipFilename } from "../services/backupZip.js";
import {
  completeOneDriveOAuth,
  disconnectOneDrive,
  getOneDriveAuthUrl,
  getOneDriveStatus,
  isOneDriveConfigured,
  oauthErrorRedirect,
  oauthSuccessRedirect,
  runOneDriveBackup,
  runScheduledOneDriveCron,
  updateOneDriveSchedule,
} from "../services/onedriveBackup.js";

const router = Router();

router.get("/", authRequired, adminOnly, async (_req, res) => {
  const payload = await buildBackupPayload();
  res.json(payload);
});

router.get("/zip", authRequired, adminOnly, async (_req, res) => {
  const { buffer, stamp } = await buildBackupZipBuffer();
  const filename = backupZipFilename(stamp);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
});

router.get("/onedrive/status", authRequired, adminOnly, async (_req, res) => {
  const status = await getOneDriveStatus();
  const cronSecret = process.env.BACKUP_CRON_SECRET;
  const apiBase = process.env.PUBLIC_API_URL || "";
  res.json({
    ...status,
    cronHint: cronSecret && apiBase
      ? `Weekly/monthly auto-upload: use cron-job.org to call GET ${apiBase}/api/backup/cron?secret=YOUR_SECRET`
      : "Set BACKUP_CRON_SECRET and PUBLIC_API_URL on Render for automatic scheduled uploads.",
  });
});

router.get("/onedrive/auth-url", authRequired, adminOnly, (_req, res) => {
  if (!isOneDriveConfigured()) {
    return res.status(503).json({ message: "OneDrive is not configured on the server yet." });
  }
  res.json({ url: getOneDriveAuthUrl() });
});

router.get("/onedrive/callback", async (req, res) => {
  const code = req.query.code;
  const err = req.query.error_description || req.query.error;
  if (err) {
    return res.redirect(oauthErrorRedirect(String(err)));
  }
  if (!code) {
    return res.redirect(oauthErrorRedirect("No authorization code from Microsoft"));
  }
  try {
    await completeOneDriveOAuth(String(code));
    res.redirect(oauthSuccessRedirect());
  } catch (e) {
    res.redirect(oauthErrorRedirect(e.message || "OneDrive connection failed"));
  }
});

router.post("/onedrive/disconnect", authRequired, adminOnly, async (_req, res) => {
  await disconnectOneDrive();
  res.json({ ok: true });
});

router.patch(
  "/onedrive/schedule",
  authRequired,
  adminOnly,
  body("schedule").isIn(["off", "weekly", "monthly"]),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Invalid schedule" });
    }
    const status = await updateOneDriveSchedule(req.body.schedule);
    res.json(status);
  }
);

router.post("/onedrive/upload", authRequired, adminOnly, async (_req, res) => {
  try {
    const result = await runOneDriveBackup({ force: true });
    if (result.skipped) {
      return res.status(400).json({ message: result.reason || "Upload skipped" });
    }
    res.json(result);
  } catch (e) {
    const doc = await getOneDriveStatus();
    res.status(500).json({ message: e.message || "Upload failed", status: doc });
  }
});

router.get("/cron", async (req, res) => {
  const secret = process.env.BACKUP_CRON_SECRET;
  if (!secret || req.query.secret !== secret) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const result = await runScheduledOneDriveCron();
    res.json(result);
  } catch (e) {
    res.status(500).json({ message: e.message || "Cron backup failed" });
  }
});

export default router;
