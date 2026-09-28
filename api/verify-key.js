import { cors, fail, deviceFrom, getIp, readBody } from "./_lib/util.js";
import { isBlocked, rateLimit } from "./_lib/ratelimit.js";
import { audit } from "./_lib/audit.js";
import { KEY_RE, describe, findKey, normalizeKey, verifyAndBind } from "./_lib/keys.js";

/*
 * POST /api/verify-key
 * Header: X-Device-Identifier: <id device>
 * Body:   { "key": "BIMZ-XXXX-XXXX-XXXX" }
 * Sukses: { success:true, valid:true, status:"ACTIVE", expiresAt, deviceIndex, maxDevices, devices:{used,max}, ... }
 *         expiresAt = 0 berarti tanpa batas waktu (key lama tanpa masa aktif).
 * Gagal : { valid:false, error:"KEY_EXPIRED", message }
 * Device baru yang masih punya slot otomatis di-bind saat verifikasi pertama.
 */
export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return fail(res, "METHOD_NOT_ALLOWED");

  try {
    const limit = await rateLimit(req, "verify", 60, 60000);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfter));
      return fail(res, "RATE_LIMITED");
    }

    // Anti tebak-key: banyak percobaan gagal dari satu IP -> diblokir sementara.
    const fails = await isBlocked(req, "verify-fail", 20, 600000);
    if (fails.blocked) {
      res.setHeader("Retry-After", String(fails.retryAfter));
      return fail(res, "RATE_LIMITED");
    }

    const body = readBody(req);
    const ip = getIp(req);
    const key = normalizeKey(body.key);
    const device = deviceFrom(req, body);

    if (!device) {
      await audit("device_rejected", { reason: "INVALID_DEVICE_ID", ip });
      return fail(res, "DEVICE_NOT_ALLOWED", "Device identifier tidak valid.");
    }
    if (!KEY_RE.test(key)) {
      await audit("key_invalid", { attempt: key, device: device.hash, ip });
      await rateLimit(req, "verify-fail", 20, 600000);
      return fail(res, "INVALID_KEY");
    }

    const found = await findKey(key);
    if (!found) {
      await audit("key_invalid", { attempt: key, device: device.hash, ip });
      await rateLimit(req, "verify-fail", 20, 600000);
      return fail(res, "INVALID_KEY");
    }

    const verdict = await verifyAndBind(found.node, key, device.hash, ip, Date.now(), device.raw);

    if (verdict.code) {
      if (verdict.code === "KEY_EXPIRED") await audit("key_expired", { key, device: device.hash, ip });
      else if (verdict.code === "SERVER_ERROR") return fail(res, "SERVER_ERROR");
      else await audit("device_rejected", { key, device: device.hash, ip, code: verdict.code });
      if (verdict.code === "INVALID_KEY") await rateLimit(req, "verify-fail", 20, 600000);
      return fail(res, verdict.code);
    }

    if (verdict.bound) {
      await audit("device_bound", { key, device: device.hash, ip, meta: { used: verdict.used, max: verdict.max } });
    }
    await audit("key_verified", { key, device: device.hash, ip });

    const info = describe(verdict.val);
    return res.status(200).json({
      success: true,
      valid: true,
      key,
      newlyBound: Boolean(verdict.bound),
      ...info,
      expiresAt: verdict.expiresAt, // sudah memperhitungkan expiry per-device key lama
      deviceIndex: verdict.deviceIndex,
      maxDevices: verdict.max
    });
  } catch (error) {
    console.error("VERIFY KEY ERROR", error);
    return fail(res, "SERVER_ERROR");
  }
}
