import crypto from "node:crypto";
import { db } from "./firebase.js";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Device-Identifier");
  res.setHeader("Cache-Control", "no-store");
}

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function deviceId(req) {
  const raw = String(req.headers["x-device-identifier"] || "unknown-device").trim();
  return sha256(raw || "unknown-device");
}
function getIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "");
  return forwarded.split(",")[0].trim() || String(req.headers["x-real-ip"] || "unknown-ip");
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ success: false, message: "METHOD NOT ALLOWED" });

  try {
    const [systemSnap, keysSnap] = await Promise.all([db.ref("system").get(), db.ref("keys").get()]);
    const system = systemSnap.val() || {};

    if (system.maintenance) {
      return res.status(200).json({ success: false, maintenance: true, message: system.maintenanceMessage || "Sedang maintenance." });
    }
    if (system.updateMode) {
      return res.status(200).json({ success: false, updateMode: true, message: system.updateMessage || "Silakan update ke versi terbaru.", version: system.version || "", downloadUrl: system.downloadUrl || "" });
    }

    const id = deviceId(req);
    const ip = getIp(req);
    const values = keysSnap.val() || {};

    // Return the key this device has already claimed, if any.
    for (const [key, value] of Object.entries(values)) {
      if (value?.status === "active" && value?.claims && Object.prototype.hasOwnProperty.call(value.claims, id)) {
        return res.status(200).json({ success: true, key, existing: true });
      }
    }

    if (req.method === "GET" && req.query?.action === "check") {
      return res.status(200).json({ success: true, available: Object.values(values).some(v => v?.status === "active") });
    }

    const candidates = Object.entries(values)
      .filter(([, value]) => value?.status === "active")
      .sort((a, b) => Number(a[1]?.createdAt || 0) - Number(b[1]?.createdAt || 0));

    for (const [key] of candidates) {
      const ref = db.ref(`keys/${key}`);
      const now = Date.now();
      const result = await ref.transaction(current => {
        if (!current || current.status !== "active") return;
        const claims = current.claims && typeof current.claims === "object" ? current.claims : {};
        if (Object.prototype.hasOwnProperty.call(claims, id)) return current;
        const maxDevices = Number(current.maxDevices || 0);
        if (maxDevices > 0 && Object.keys(claims).length >= maxDevices) return;
        return { ...current, claims: { ...claims, [id]: { device: id, ip, claimedAt: now } }, lastClaimAt: now };
      });
      if (result.committed) return res.status(200).json({ success: true, key, existing: false });
    }

    return res.status(200).json({ success: false, message: "NO KEY AVAILABLE" });
  } catch (error) {
    console.error("GETKEY ERROR", error);
    return res.status(500).json({ success: false, message: "SERVER ERROR" });
  }
}
