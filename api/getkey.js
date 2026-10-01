import { db } from "./firebase.js";
import { DAY_MS, cors, deviceFrom, fail, getIp } from "./_lib/util.js";
import { rateLimit } from "./_lib/ratelimit.js";
import { audit } from "./_lib/audit.js";
import { statusOf } from "./_lib/keys.js";

/*
 * Sistem STOK key lama (/keys). Bentuk response dipertahankan:
 *   { success, key, existing } | { success:false, message, ... }
 * Perubahan: device identifier wajib valid, rate limit, key kedaluwarsa/dicabut
 * tidak dibagikan, dan audit log.
 */
export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ success: false, error: "METHOD_NOT_ALLOWED", message: "METHOD NOT ALLOWED" });

  try {
    const limit = await rateLimit(req, "getkey", 30, 60000);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfter));
      return fail(res, "RATE_LIMITED");
    }

    const [systemSnap, keysSnap] = await Promise.all([db.ref("system").get(), db.ref("keys").get()]);
    const system = systemSnap.val() || {};

    if (system.maintenance) {
      return res.status(200).json({ success: false, maintenance: true, message: system.maintenanceMessage || "Sedang maintenance." });
    }
    if (system.updateMode) {
      return res.status(200).json({ success: false, updateMode: true, message: system.updateMessage || "Silakan update ke versi terbaru.", version: system.version || "", downloadUrl: system.downloadUrl || "" });
    }

    const device = deviceFrom(req);
    const ip = getIp(req);
    if (!device) {
      await audit("device_rejected", { reason: "INVALID_DEVICE_ID", ip, meta: { via: "getkey" } });
      return fail(res, "DEVICE_NOT_ALLOWED", "Device identifier tidak valid.");
    }
    const id = device.hash;
    const values = keysSnap.val() || {};
    const now = Date.now();
    const isActive = value => String(value?.status || "").toLowerCase() === "active" && statusOf(value, now) === "ACTIVE";

    // Kembalikan key yang sudah pernah di-claim device ini, jika masih aktif.
    for (const [key, value] of Object.entries(values)) {
      if (isActive(value) && value?.claims && Object.prototype.hasOwnProperty.call(value.claims, id)) {
        return res.status(200).json({ success: true, key, existing: true });
      }
    }

    if (req.method === "GET" && req.query?.action === "check") {
      return res.status(200).json({ success: true, available: Object.values(values).some(isActive) });
    }

    const candidates = Object.entries(values)
      .filter(([, value]) => isActive(value))
      .sort((a, b) => Number(a[1]?.createdAt || 0) - Number(b[1]?.createdAt || 0));

    for (const [key] of candidates) {
      const ref = db.ref(`keys/${key}`);
      const claimedAt = Date.now();
      const result = await ref.transaction(current => {
        if (!current) return null; // pass pertama tanpa cache; server akan mengulang dengan data asli
        if (String(current.status || "").toLowerCase() !== "active" || statusOf(current, claimedAt) !== "ACTIVE") return;
        const claims = current.claims && typeof current.claims === "object" ? current.claims : {};
        if (Object.prototype.hasOwnProperty.call(claims, id)) return current;
        const maxDevices = Number(current.maxDevices || 0);
        if (maxDevices > 0 && Object.keys(claims).length >= maxDevices) return;
        const durationDays = Number(current.durationDays || 0);
        const claim = { device: id, ip, claimedAt, deviceIndex: Object.keys(claims).length + 1 };
        if (durationDays > 0) claim.expiredAt = claimedAt + Math.round(durationDays * DAY_MS);
        return { ...current, claims: { ...claims, [id]: claim }, lastClaimAt: claimedAt };
      });
      const saved = result.snapshot.val();
      if (result.committed && saved?.claims && Object.prototype.hasOwnProperty.call(saved.claims, id)) {
        await audit("key_claimed", { key, device: id, ip, meta: { via: "stock" } });
        await audit("device_bound", { key, device: id, ip, meta: { used: Object.keys(saved.claims).length, max: Number(saved.maxDevices || 0) } });
        return res.status(200).json({ success: true, key, existing: false });
      }
    }

    return res.status(200).json({ success: false, message: "NO KEY AVAILABLE" });
  } catch (error) {
    console.error("GETKEY ERROR", error);
    return res.status(500).json({ success: false, error: "SERVER_ERROR", message: "SERVER ERROR" });
  }
}
