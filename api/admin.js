import crypto from "node:crypto";
import { db } from "./firebase.js";
import { requireAdmin } from "./auth.js";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
}

function makeKey() {
  return `MZ-${crypto.randomBytes(4).toString("hex").toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function normalizeClaims(claims) {
  if (!claims || typeof claims !== "object") return [];
  return Object.entries(claims)
    .map(([device, value]) => ({
      device,
      ip: String(value?.ip || "unknown-ip"),
      claimedAt: Number(value?.claimedAt || 0)
    }))
    .sort((a, b) => b.claimedAt - a.claimedAt);
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    await requireAdmin(req);

    if (req.method === "GET") {
      const snapshot = await db.ref("keys").orderByChild("createdAt").limitToLast(500).get();
      const values = snapshot.val() || {};
      const keys = Object.entries(values).map(([key, value]) => {
        const claims = normalizeClaims(value?.claims);
        return {
          key,
          status: value?.status || "active",
          createdAt: Number(value?.createdAt || 0),
          lastClaimAt: Number(value?.lastClaimAt || 0),
          claimCount: claims.length,
          maxDevices: Number(value?.maxDevices || 0),
          claims
        };
      });
      keys.sort((a, b) => b.createdAt - a.createdAt);
      return res.status(200).json({ success: true, keys });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ success: false, message: "METHOD NOT ALLOWED" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    if (body.action === "generate") {
      const count = Math.max(1, Math.min(100, Number(body.count) || 1));
      const maxDevicesRaw = Number(body.maxDevices || 0);
      const maxDevices = maxDevicesRaw <= 0 ? 0 : Math.max(1, Math.min(100000, Math.floor(maxDevicesRaw)));
      const updates = {};
      const generated = [];
      const now = Date.now();

      for (let i = 0; i < count; i++) {
        let key;
        do key = makeKey(); while (updates[`keys/${key}`]);
        generated.push(key);
        updates[`keys/${key}`] = { status: "active", createdAt: now, maxDevices };
      }

      await db.ref().update(updates);
      return res.status(200).json({ success: true, generated, maxDevices });
    }

    if (body.action === "setStatus") {
      const key = String(body.key || "").trim();
      const status = body.status === "disabled" ? "disabled" : "active";
      if (!/^MZ-[A-Z0-9]+-[A-Z0-9]+$/.test(key)) {
        return res.status(400).json({ success: false, message: "INVALID KEY" });
      }

      const ref = db.ref(`keys/${key}`);
      const snapshot = await ref.get();
      if (!snapshot.exists()) return res.status(404).json({ success: false, message: "KEY NOT FOUND" });

      await ref.update({ status, [`${status === "disabled" ? "disabledAt" : "enabledAt"}`]: Date.now() });
      return res.status(200).json({ success: true, key, status });
    }

    return res.status(400).json({ success: false, message: "UNKNOWN ACTION" });
  } catch (error) {
    console.error("ADMIN ERROR", error);
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: status === 500 ? "SERVER ERROR" : error.message });
  }
}
