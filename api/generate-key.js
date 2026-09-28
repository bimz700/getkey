import { db } from "./firebase.js";
import { cors, fail, deviceFrom, getIp, DEFAULT_DURATION_MS, DEFAULT_MAX_DEVICES, readBody } from "./_lib/util.js";
import { rateLimit } from "./_lib/ratelimit.js";
import { audit } from "./_lib/audit.js";
import { createIfAbsent, describe, generateKey, statusOf } from "./_lib/keys.js";

/*
 * GET  /api/generate-key  -> status key milik device ini (tidak membuat key)
 * POST /api/generate-key  -> buat key baru (atau kembalikan key aktif milik device ini)
 * Device dikirim lewat header X-Device-Identifier.
 */

function payload(key, record, existing, deviceHash) {
  return {
    success: true,
    valid: true,
    hasKey: true,
    key,
    existing,
    device: deviceHash.slice(0, 8).toUpperCase(),
    ...describe(record)
  };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!["GET", "POST"].includes(req.method)) return fail(res, "METHOD_NOT_ALLOWED");

  try {
    const isPost = req.method === "POST";
    const limit = isPost ? await rateLimit(req, "generate", 10, 3600000) : await rateLimit(req, "generate-status", 60, 60000);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfter));
      return fail(res, "RATE_LIMITED");
    }

    const body = readBody(req);
    const device = deviceFrom(req, body);
    const ip = getIp(req);
    if (!device) {
      await audit("device_rejected", { reason: "INVALID_DEVICE_ID", ip });
      return fail(res, "DEVICE_NOT_ALLOWED", "Device identifier tidak valid.");
    }

    const now = Date.now();
    const indexRef = db.ref(`deviceKeys/${device.hash}`);
    const previousKey = (await indexRef.get()).val() || null;

    if (previousKey) {
      const snap = await db.ref(`licenses/${previousKey}`).get();
      if (snap.exists()) {
        const record = snap.val();
        const status = statusOf(record, now);
        if (status === "ACTIVE") return res.status(200).json(payload(previousKey, record, true, device.hash));
        if (status === "REVOKED" || status === "DISABLED") {
          await audit("device_rejected", { key: previousKey, device: device.hash, ip, code: "KEY_REVOKED" });
          return fail(res, "KEY_REVOKED", "Key untuk device ini telah dicabut oleh admin.");
        }
        if (!isPost) return res.status(200).json({ success: true, hasKey: true, key: previousKey, existing: true, device: device.hash.slice(0, 8).toUpperCase(), ...describe(record, now) });
        // EXPIRED + POST -> lanjut membuat key baru
      }
    }

    if (!isPost) {
      return res.status(200).json({ success: true, hasKey: false, device: device.hash.slice(0, 8).toUpperCase() });
    }

    const system = (await db.ref("system").get()).val() || {};
    if (system.maintenance) {
      return res.status(503).json({ success: false, valid: false, error: "MAINTENANCE", maintenance: true, message: system.maintenanceMessage || "Sedang maintenance." });
    }

    let key = null;
    let record = null;
    for (let attempt = 0; attempt < 5 && !key; attempt += 1) {
      const candidate = generateKey();
      const draft = {
        key: candidate,
        status: "active",
        source: "generated",
        createdAt: now,
        updatedAt: now,
        durationMs: DEFAULT_DURATION_MS,
        expiresAt: now + DEFAULT_DURATION_MS,
        maxDevices: DEFAULT_MAX_DEVICES,
        createdBy: "device",
        claims: { [device.hash]: { device: device.hash, ip, claimedAt: now, deviceIndex: 1 } },
        lastClaimAt: now
      };
      if (await createIfAbsent("licenses", candidate, draft)) {
        key = candidate;
        record = draft;
      }
    }
    if (!key) return fail(res, "SERVER_ERROR");

    // Klaim slot device -> key secara atomic; jika kalah balapan, buang key ini dan pakai pemenang.
    const claim = await indexRef.transaction(
      current => (current === null || current === previousKey ? key : undefined),
      undefined,
      false
    );
    if (!claim.committed || claim.snapshot.val() !== key) {
      await db.ref(`licenses/${key}`).remove();
      const winner = (await indexRef.get()).val();
      const winnerSnap = winner ? await db.ref(`licenses/${winner}`).get() : null;
      if (winnerSnap?.exists() && statusOf(winnerSnap.val(), now) === "ACTIVE") {
        return res.status(200).json(payload(winner, winnerSnap.val(), true, device.hash));
      }
      return fail(res, "SERVER_ERROR");
    }

    await audit("key_created", { key, actor: "device", device: device.hash, ip, meta: { source: "generated" } });
    await audit("key_claimed", { key, device: device.hash, ip });
    await audit("device_bound", { key, device: device.hash, ip, meta: { used: 1, max: DEFAULT_MAX_DEVICES } });
    return res.status(200).json(payload(key, record, false, device.hash));
  } catch (error) {
    console.error("GENERATE KEY ERROR", error);
    return fail(res, "SERVER_ERROR");
  }
}
