import { cors, fail, deviceFrom, getIp, readBody } from "./_lib/util.js";
import { rateLimit } from "./_lib/ratelimit.js";
import { audit } from "./_lib/audit.js";
import { LOOSE_KEY_RE, findKey, normalizeKey, verifyAndBind } from "./_lib/keys.js";

/*
 * POST /api/verify-key   (dipakai aplikasi Android dan website)
 * Header: X-Device-Identifier: <ANDROID_ID>      (wajib)
 *         X-Device-Model: <Manufacturer Model>   (opsional, hanya tampilan admin)
 * Body  : { "key": "BIMZ-XXXX-XXXX-XXXX" }
 * Sukses: { success:true, valid:true, status:"ACTIVE", expiresAt, deviceIndex, maxDevices,
 *           newlyBound, devices:{used,max} }         expiresAt = ms epoch, 0 = tanpa batas
 * Gagal : { success:false, valid:false, error:"KEY_EXPIRED", message }
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

    const body = readBody(req);
    const ip = getIp(req);
    const typed = String(body.key || "").trim();
    const key = normalizeKey(typed);
    const device = deviceFrom(req, body);

    if (!device) {
      await audit("device_rejected", { reason: "INVALID_DEVICE_ID", ip });
      return fail(res, "DEVICE_NOT_ALLOWED", "Device identifier tidak valid.");
    }
    if (!LOOSE_KEY_RE.test(typed)) {
      await audit("key_invalid", { attempt: typed, device: device.hash, ip });
      return fail(res, "INVALID_KEY");
    }

    // Huruf besar dulu; jika tidak ada, coba persis seperti diketik (key lama bisa saja huruf kecil).
    const found = await findKey(key, typed);
    if (!found) {
      await audit("key_invalid", { attempt: typed, device: device.hash, ip });
      return fail(res, "INVALID_KEY");
    }

    const verdict = await verifyAndBind(found.node, found.key, device, ip);

    if (verdict.code) {
      if (verdict.code === "SERVER_ERROR") return fail(res, "SERVER_ERROR");
      if (verdict.code === "KEY_EXPIRED") await audit("key_expired", { key: found.key, device: device.hash, ip });
      else await audit("device_rejected", { key: found.key, device: device.hash, ip, code: verdict.code });
      return fail(res, verdict.code);
    }

    if (verdict.bound) {
      await audit("device_bound", { key: found.key, device: device.hash, ip, meta: { used: verdict.used, max: verdict.max } });
    }
    await audit("key_verified", { key: found.key, device: device.hash, ip });

    return res.status(200).json({
      success: true,
      valid: true,
      key: found.key,
      status: "ACTIVE",
      expiresAt: verdict.expiresAt,
      deviceIndex: verdict.deviceIndex,
      maxDevices: verdict.max,
      newlyBound: Boolean(verdict.bound),
      devices: { used: verdict.used, max: verdict.max }
    });
  } catch (error) {
    console.error("VERIFY KEY ERROR", error);
    return fail(res, "SERVER_ERROR");
  }
}
