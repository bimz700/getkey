import { db } from "./firebase.js";
import { requireAdmin } from "./auth.js";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
}

function normalizeKey(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeClaims(claims) {
  if (!claims || typeof claims !== "object") return [];
  return Object.entries(claims).map(([device, value]) => ({
    device,
    ip: String(value?.ip || "unknown-ip"),
    claimedAt: Number(value?.claimedAt || 0)
  })).sort((a, b) => b.claimedAt - a.claimedAt);
}

async function readKeys() {
  const snapshot = await db.ref("keys").get();
  const values = snapshot.val() || {};
  return Object.entries(values).map(([key, value]) => {
    const claims = normalizeClaims(value?.claims);
    return {
      key,
      status: value?.status || "active",
      createdAt: Number(value?.createdAt || 0),
      updatedAt: Number(value?.updatedAt || 0),
      claimCount: claims.length,
      maxDevices: Number(value?.maxDevices || 0),
      claims
    };
  }).sort((a, b) => b.createdAt - a.createdAt);
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    await requireAdmin(req);

    if (req.method === "GET") {
      const [keys, systemSnap] = await Promise.all([
        readKeys(),
        db.ref("system").get()
      ]);
      return res.status(200).json({ success: true, keys, system: systemSnap.val() || {} });
    }

    if (req.method !== "POST") return res.status(405).json({ success: false, message: "METHOD NOT ALLOWED" });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const action = String(body.action || "");
    const now = Date.now();

    if (action === "saveKey") {
      const key = normalizeKey(body.key);
      const maxDevicesRaw = Number(body.maxDevices);
      const maxDevices = maxDevicesRaw <= 0 ? 0 : Math.min(100000, Math.floor(maxDevicesRaw));
      if (!/^[A-Z0-9][A-Z0-9_-]{2,100}$/.test(key)) {
        return res.status(400).json({ success: false, message: "INVALID KEY" });
      }
      const ref = db.ref(`keys/${key}`);
      const existing = await ref.get();
      const current = existing.val() || {};
      await ref.set({
        ...current,
        status: body.status === "disabled" ? "disabled" : "active",
        maxDevices,
        createdAt: Number(current.createdAt || now),
        updatedAt: now,
        claims: current.claims || {}
      });
      return res.status(200).json({ success: true, key });
    }

    if (action === "setStatus") {
      const key = normalizeKey(body.key);
      const status = body.status === "disabled" ? "disabled" : "active";
      const ref = db.ref(`keys/${key}`);
      const snapshot = await ref.get();
      if (!snapshot.exists()) return res.status(404).json({ success: false, message: "KEY NOT FOUND" });
      await ref.update({ status, updatedAt: now });
      return res.status(200).json({ success: true, key, status });
    }

    if (action === "deleteKey") {
      const key = normalizeKey(body.key);
      const ref = db.ref(`keys/${key}`);
      if (!(await ref.get()).exists()) return res.status(404).json({ success: false, message: "KEY NOT FOUND" });
      await ref.remove();
      return res.status(200).json({ success: true, key });
    }

    if (action === "saveSystem") {
      const maintenance = Boolean(body.maintenance);
      const updateMode = Boolean(body.updateMode);
      const maintenanceMessage = String(body.maintenanceMessage || "Sedang maintenance, silakan coba lagi nanti.").slice(0, 500);
      const updateMessage = String(body.updateMessage || "Silakan update ke versi terbaru.").slice(0, 500);
      const version = String(body.version || "").slice(0, 50);
      const downloadUrl = String(body.downloadUrl || "").slice(0, 1000);
      await db.ref("system").set({ maintenance, updateMode, maintenanceMessage, updateMessage, version, downloadUrl, updatedAt: now });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ success: false, message: "UNKNOWN ACTION" });
  } catch (error) {
    console.error("ADMIN ERROR", error);
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: status === 500 ? "SERVER ERROR" : error.message });
  }
}
