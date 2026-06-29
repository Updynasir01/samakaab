import AppSettings from "../models/AppSettings.js";
import { buildBackupZipBuffer, backupZipFilename } from "./backupZip.js";

const SCOPES = "Files.ReadWrite offline_access User.Read";

function msConfigured() {
  return Boolean(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.MS_REDIRECT_URI);
}

function frontendUrl() {
  const raw = process.env.FRONTEND_URL || process.env.CORS_ORIGIN?.split(",")[0]?.trim() || "";
  return raw.replace(/\/$/, "");
}

async function getSettingsDoc() {
  let doc = await AppSettings.findOne();
  if (!doc) doc = await AppSettings.create({});
  return doc;
}

export function isOneDriveConfigured() {
  return msConfigured();
}

export function getOneDriveAuthUrl() {
  if (!msConfigured()) {
    throw new Error("OneDrive is not configured on the server (MS_CLIENT_ID, MS_CLIENT_SECRET, MS_REDIRECT_URI).");
  }
  const params = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    response_type: "code",
    redirect_uri: process.env.MS_REDIRECT_URI,
    scope: SCOPES,
    response_mode: "query",
    prompt: "consent",
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

async function exchangeCodeForTokens(code) {
  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    client_secret: process.env.MS_CLIENT_SECRET,
    code,
    redirect_uri: process.env.MS_REDIRECT_URI,
    grant_type: "authorization_code",
    scope: SCOPES,
  });
  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || "Token exchange failed");
  return data;
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    client_secret: process.env.MS_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: SCOPES,
  });
  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || "Token refresh failed");
  return data;
}

async function fetchGraphProfile(accessToken) {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Could not read Microsoft account profile");
  return res.json();
}

export async function completeOneDriveOAuth(code) {
  const tokens = await exchangeCodeForTokens(code);
  const profile = await fetchGraphProfile(tokens.access_token);
  const doc = await getSettingsDoc();
  doc.onedrive = {
    ...doc.onedrive?.toObject?.() || doc.onedrive || {},
    refreshToken: tokens.refresh_token,
    accountEmail: profile.mail || profile.userPrincipalName || "",
    connectedAt: new Date(),
    lastBackupError: "",
  };
  await doc.save();
  return doc.onedrive;
}

export async function disconnectOneDrive() {
  const doc = await getSettingsDoc();
  doc.onedrive = {
    schedule: "off",
    folderName: doc.onedrive?.folderName || "SamakaabBackups",
  };
  await doc.save();
}

export async function updateOneDriveSchedule(schedule) {
  const doc = await getSettingsDoc();
  if (!doc.onedrive?.refreshToken) {
    throw new Error("Connect OneDrive first");
  }
  doc.onedrive.schedule = schedule;
  await doc.save();
  return publicOneDriveStatus(doc);
}

export function publicOneDriveStatus(doc) {
  const od = doc?.onedrive || {};
  const connected = Boolean(od.refreshToken);
  return {
    connected,
    msConfigured: msConfigured(),
    accountEmail: connected ? od.accountEmail || "" : "",
    schedule: od.schedule || "off",
    folderName: od.folderName || "SamakaabBackups",
    lastBackupAt: od.lastBackupAt || null,
    lastBackupFile: od.lastBackupFile || "",
    lastBackupError: od.lastBackupError || "",
    connectedAt: od.connectedAt || null,
  };
}

export async function getOneDriveStatus() {
  const doc = await getSettingsDoc();
  return publicOneDriveStatus(doc);
}

async function uploadZipToOneDrive(accessToken, folder, filename, buffer) {
  const safeFolder = String(folder || "SamakaabBackups").replace(/^\/+|\/+$/g, "");
  const graphUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${safeFolder}/${filename}:/content`;
  const res = await fetch(graphUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/zip",
    },
    body: buffer,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.slice(0, 300) || "OneDrive upload failed");
  }
  return res.json();
}

function scheduleDue(schedule, lastBackupAt) {
  if (schedule === "off") return false;
  if (!lastBackupAt) return true;
  const last = new Date(lastBackupAt).getTime();
  const days = (Date.now() - last) / (24 * 60 * 60 * 1000);
  if (schedule === "weekly") return days >= 7;
  if (schedule === "monthly") return days >= 28;
  return false;
}

/** Create ZIP and upload to connected OneDrive. */
export async function runOneDriveBackup({ force = false } = {}) {
  if (!msConfigured()) {
    return { skipped: true, reason: "OneDrive not configured on server" };
  }
  const doc = await getSettingsDoc();
  const od = doc.onedrive;
  if (!od?.refreshToken) {
    return { skipped: true, reason: "OneDrive not connected" };
  }
  if (!force && !scheduleDue(od.schedule, od.lastBackupAt)) {
    return { skipped: true, reason: "Not due yet", schedule: od.schedule, lastBackupAt: od.lastBackupAt };
  }

  try {
    const tokens = await refreshAccessToken(od.refreshToken);
    if (tokens.refresh_token) od.refreshToken = tokens.refresh_token;

    const { buffer, stamp } = await buildBackupZipBuffer();
    const filename = backupZipFilename(stamp);
    const folder = od.folderName || "SamakaabBackups";

    await uploadZipToOneDrive(tokens.access_token, folder, filename, buffer);

    od.lastBackupAt = new Date();
    od.lastBackupFile = filename;
    od.lastBackupError = "";
    doc.onedrive = od;
    await doc.save();

    return {
      ok: true,
      filename,
      folder,
      uploadedAt: od.lastBackupAt,
      sizeBytes: buffer.length,
    };
  } catch (e) {
    od.lastBackupError = e.message || "Upload failed";
    doc.onedrive = od;
    await doc.save();
    throw e;
  }
}

export async function runScheduledOneDriveCron() {
  const doc = await getSettingsDoc();
  const schedule = doc.onedrive?.schedule;
  if (!schedule || schedule === "off") {
    return { skipped: true, reason: "Automatic backup is off" };
  }
  return runOneDriveBackup({ force: false });
}

export function oauthSuccessRedirect() {
  const base = frontendUrl();
  return base ? `${base}/settings?onedrive=connected` : "/settings?onedrive=connected";
}

export function oauthErrorRedirect(message) {
  const base = frontendUrl();
  const q = `onedrive=error&msg=${encodeURIComponent(message.slice(0, 120))}`;
  return base ? `${base}/settings?${q}` : `/settings?${q}`;
}
