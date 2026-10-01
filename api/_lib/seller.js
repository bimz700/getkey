import { db } from "./firebase.js";
import { requireSeller } from "./auth.js";
import { audit } from "./_lib/audit.js";
import { rateLimit } from "./_lib/ratelimit.js";
import { DAY_MS, DEFAULT_DURATION_MS, DEFAULT_MAX_DEVICES, fail, getIp, readBody } from "./_lib/util.js";
import { createIfAbsent, generateKey, statusOf } from "./_lib/keys.js";

/*
 * Seller Panel API. SEMUA data difilter di SERVER berdasarkan UID dari token
 * (licenses.sellerId == uid). Seller tidak pernah menerima key milik orang lain,
 * dan tidak ada parameter yang bisa dipakai untuk meminta data seller lain.
 *
 * GET  /api/seller                  -> { keys:[...milik sendiri], stats, limits }
 * POST /api/seller {action:"createKey", durationDays, maxDevices, count}
 * Revoke / extend / delete tetap hanya untuk Admin.
 */
function bad(res, message) {
  return res.status(400).json({ success: false, valid: false, error: "BAD_REQUEST", message });
}

async function readOwn(uid) {
  const snap = await db.ref("licenses").orderByChild("sellerId").equalTo(uid).get();
  const now = Date.now();
  const keys = [];
  snap.forEach(child => {
    const value = child.val() || {};
    if (value.sellerId !== uid) return; // pengaman ganda
    const claims = value.claims && typeof value.claims === "object" ? Object.entries(value.claims) : [];
    keys.push({
      key: child.key,
      status: statusOf(value, now),
      createdAt: Number(value.createdAt || 0),
      expiresAt: Number(value.expiresAt || 0),
      durationMs: Number(value.durationMs || 0),
      maxDevices: Number(value.maxDevices || 0),
      claimCount: claims.length,
      claims: claims
        .map(([id, claim]) => ({
          device: String(claim?.device || id).slice(0, 8),
          model: String(claim?.model || ""),
          deviceIndex: Number(claim?.deviceIndex || 0),
          claimedAt: Number(claim?.claimedAt || 0)
        }))
        .sort((a, b) => a.claimedAt - b.claimedAt)
    });
  });
  return keys.sort((a, b) => b.createdAt - a.createdAt);
}

function statsOf(keys, now = Date.now()) {
  const stats = { total: keys.length, active: 0, expired: 0, revoked: 0, disabled: 0, unused: 0, devicesBound: 0, expiringSoon: 0, createdToday: 0, createdLast7Days: 0 };
  const startOfDay = new Date(now).setHours(0, 0, 0, 0);
  for (const key of keys) {
    if (key.status === "ACTIVE") stats.active += 1;
    else if (key.status === "EXPIRED") stats.expired += 1;
    else if (key.status === "REVOKED") stats.revoked += 1;
    else if (key.status === "DISABLED") stats.disabled += 1;
    if (key.status === "ACTIVE" && key.claimCount === 0) stats.unused += 1;
    if (key.status === "ACTIVE" && key.expiresAt > 0 && key.expiresAt - now <= 3 * DAY_MS) stats.expiringSoon += 1;
    stats.devicesBound += key.claimCount;
    if (key.createdAt >= startOfDay) stats.createdToday += 1;
    if (key.createdAt >= now - 7 * DAY_MS) stats.createdLast7Days += 1;
  }
  return stats;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const limit = await rateLimit(req, "seller", 120, 60000);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfter));
      return fail(res, "RATE_LIMITED");
    }

    const me = await requireSeller(req);

    if (req.method === "GET") {
      const keys = await readOwn(me.uid);
      return res.status(200).json({ success: true, keys, stats: statsOf(keys), limits: me.limits });
    }
    if (req.method !== "POST") return fail(res, "METHOD_NOT_ALLOWED");

    const body = readBody(req);
    if (String(body.action || "") !== "createKey") return bad(res, "UNKNOWN ACTION");

    const create = await rateLimit(req, "seller-create", 20, 3600000);
    if (!create.allowed) {
      res.setHeader("Retry-After", String(create.retryAfter));
      return fail(res, "RATE_LIMITED");
    }

    const days = body.durationDays === undefined || body.durationDays === "" ? DEFAULT_DURATION_MS / DAY_MS : Number(body.durationDays);
    const max = body.maxDevices === undefined || body.maxDevices === "" ? DEFAULT_MAX_DEVICES : Math.floor(Number(body.maxDevices));
    const count = body.count === undefined || body.count === "" ? 1 : Math.floor(Number(body.count));

    if (!Number.isFinite(days) || days <= 0 || days > me.limits.maxDurationDays) return bad(res, `Masa aktif harus 0-${me.limits.maxDurationDays} hari.`);
    if (!Number.isFinite(max) || max < 1 || max > me.limits.maxDevices) return bad(res, `Maximum device harus 1-${me.limits.maxDevices}.`);
    if (!Number.isFinite(count) || count < 1 || count > 20) return bad(res, "Jumlah key harus 1-20.");

    const now = Date.now();
    const durationMs = Math.round(days * DAY_MS);
    const ip = getIp(req);
    const created = [];

    for (let i = 0; i < count; i += 1) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const key = generateKey();
        const record = {
          key,
          status: "active",
          source: "seller",
          sellerId: me.uid,
          createdBy: me.uid,
          createdByEmail: String(me.email || "").toLowerCase(),
          createdAt: now,
          updatedAt: now,
          durationMs,
          expiresAt: now + durationMs,
          maxDevices: max,
          claims: {}
        };
        if (await createIfAbsent("licenses", key, record)) {
          created.push({ key, expiresAt: record.expiresAt, durationMs, maxDevices: max });
          await audit("key_created", { key, actor: me.email, sellerId: me.uid, ip, meta: { source: "seller", durationMs, maxDevices: max } });
          break;
        }
      }
    }
    if (!created.length) return fail(res, "SERVER_ERROR");
    return res.status(200).json({ success: true, keys: created });
  } catch (error) {
    const status = error.status || 500;
    if (status === 500) console.error("SELLER ERROR", error);
    return res.status(status).json({
      success: false,
      error: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "SERVER_ERROR",
      message: status === 500 ? "SERVER ERROR" : error.message
    });
  }
}
