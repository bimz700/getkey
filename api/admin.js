import { db } from "./firebase.js";
import { requireAdmin } from "./auth.js";
import { audit } from "./_lib/audit.js";
import { rateLimit } from "./_lib/ratelimit.js";
import {
  DAY_MS, DEFAULT_DURATION_MS, DEFAULT_MAX_DEVICES, MAX_DEVICES_LIMIT, MAX_DURATION_DAYS,
  fail, readBody, getIp
} from "./_lib/util.js";
import { KEY_RE, createIfAbsent, findKey, generateKey, normalizeKey, statusOf } from "./_lib/keys.js";

/* Admin panel hanya same-origin, jadi tidak ada header Access-Control-Allow-Origin. */
function headers(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
}

function normalizeClaims(claims) {
  if (!claims || typeof claims !== "object") return [];
  return Object.entries(claims)
    .map(([device, value]) => {
      value = value || {};
      return {
        device: String(value.device || device),
        ip: String(value.ip || "unknown-ip"),
        claimedAt: Number(value.claimedAt || 0),
        expiredAt: Number(value.expiredAt || 0),
        deviceIndex: Number(value.deviceIndex || 0)
      };
    })
    .sort((a, b) => b.claimedAt - a.claimedAt);
}

async function readKeys() {
  const now = Date.now();
  const [licenses, legacy] = await Promise.all([db.ref("licenses").get(), db.ref("keys").get()]);
  const out = [];
  const add = (values, node) => {
    for (const [key, raw] of Object.entries(values || {})) {
      const value = raw || {};
      const claims = normalizeClaims(value.claims);
      out.push({
        key,
        node,
        source: value.source || (node === "licenses" ? "generated" : "legacy"),
        status: value.status || "active",
        displayStatus: statusOf({ ...value, status: value.status || "active" }, now),
        createdAt: Number(value.createdAt || 0),
        updatedAt: Number(value.updatedAt || 0),
        expiresAt: Number(value.expiresAt || 0),
        durationMs: Number(value.durationMs || 0),
        durationDays: Number(value.durationDays || 0),
        maxDevices: Number(value.maxDevices || 0),
        revokedAt: Number(value.revokedAt || 0),
        revokedBy: value.revokedBy || "",
        claimCount: claims.length,
        claims
      });
    }
  };
  add(licenses.val(), "licenses");
  add(legacy.val(), "keys");
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

function positiveDays(value) {
  const days = Number(value);
  return Number.isFinite(days) && days > 0 && days <= MAX_DURATION_DAYS ? days : null;
}

export default async function handler(req, res) {
  headers(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const limit = await rateLimit(req, "admin", 120, 60000);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfter));
      return fail(res, "RATE_LIMITED");
    }

    const admin = await requireAdmin(req);
    const actor = String(admin.email || "admin");
    const ip = getIp(req);

    if (req.method === "GET") {
      const [keys, systemSnap] = await Promise.all([readKeys(), db.ref("system").get()]);
      return res.status(200).json({ success: true, keys, system: systemSnap.val() || {} });
    }
    if (req.method !== "POST") return res.status(405).json({ success: false, error: "METHOD_NOT_ALLOWED", message: "METHOD NOT ALLOWED" });

    const body = readBody(req);
    const action = String(body.action || "");
    const now = Date.now();

    /* ---------- SAVE KEY (stok lama, manual) ---------- */
    if (action === "saveKey") {
      const key = normalizeKey(body.key);
      const raw = Number(body.maxDevices);
      const maxDevices = raw <= 0 || Number.isNaN(raw) ? 0 : Math.min(MAX_DEVICES_LIMIT, Math.floor(raw));
      if (!KEY_RE.test(key)) return res.status(400).json({ success: false, error: "BAD_REQUEST", message: "INVALID KEY" });
      if ((await db.ref(`licenses/${key}`).get()).exists()) {
        return res.status(409).json({ success: false, error: "BAD_REQUEST", message: "KEY SUDAH ADA SEBAGAI GENERATED KEY" });
      }
      const ref = db.ref(`keys/${key}`);
      const current = (await ref.get()).val() || {};
      await ref.set({
        ...current,
        status: body.status === "disabled" ? "disabled" : "active",
        maxDevices,
        createdAt: Number(current.createdAt || now),
        updatedAt: now,
        claims: current.claims || {}
      });
      if (!current.createdAt) await audit("key_created", { key, actor, ip, meta: { source: "legacy", maxDevices } });
      return res.status(200).json({ success: true, key });
    }

    /* ---------- CREATE KEY (generate, dengan durasi + max device) ---------- */
    if (action === "createKey") {
      const days = body.durationDays === undefined || body.durationDays === "" ? DEFAULT_DURATION_MS / DAY_MS : positiveDays(body.durationDays);
      const max = body.maxDevices === undefined || body.maxDevices === "" ? DEFAULT_MAX_DEVICES : Math.floor(Number(body.maxDevices));
      const count = body.count === undefined || body.count === "" ? 1 : Math.floor(Number(body.count));
      if (!days) return res.status(400).json({ success: false, error: "BAD_REQUEST", message: `Masa aktif harus 0-${MAX_DURATION_DAYS} hari.` });
      if (!Number.isFinite(max) || max < 1 || max > MAX_DEVICES_LIMIT) return res.status(400).json({ success: false, error: "BAD_REQUEST", message: `Maximum device harus 1-${MAX_DEVICES_LIMIT}.` });
      if (!Number.isFinite(count) || count < 1 || count > 20) return res.status(400).json({ success: false, error: "BAD_REQUEST", message: "Jumlah key harus 1-20." });

      const durationMs = Math.round(days * DAY_MS);
      const created = [];
      for (let i = 0; i < count; i += 1) {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const key = generateKey();
          const record = { key, status: "active", source: "admin", createdAt: now, updatedAt: now, durationMs, expiresAt: now + durationMs, maxDevices: max, createdBy: actor, claims: {} };
          if (await createIfAbsent("licenses", key, record)) {
            created.push({ key, expiresAt: record.expiresAt, durationMs, maxDevices: max });
            await audit("key_created", { key, actor, ip, meta: { source: "admin", durationMs, maxDevices: max } });
            break;
          }
        }
      }
      if (!created.length) return fail(res, "SERVER_ERROR");
      return res.status(200).json({ success: true, keys: created });
    }

    /* ---------- SET STATUS (enable / disable) ---------- */
    if (action === "setStatus") {
      const key = normalizeKey(body.key);
      const status = body.status === "disabled" ? "disabled" : "active";
      const found = KEY_RE.test(key) ? await findKey(key) : null;
      if (!found) return res.status(404).json({ success: false, error: "INVALID_KEY", message: "KEY NOT FOUND" });
      const update = { status, updatedAt: now };
      if (status === "active") { update.revokedAt = null; update.revokedBy = null; }
      await found.ref.update(update);
      await audit(status === "active" ? "key_enabled" : "key_disabled", { key, actor, ip });
      return res.status(200).json({ success: true, key, status });
    }

    /* ---------- REVOKE (hanya admin, permanen sampai di-enable admin) ---------- */
    if (action === "revokeKey") {
      const key = normalizeKey(body.key);
      const found = KEY_RE.test(key) ? await findKey(key) : null;
      if (!found) return res.status(404).json({ success: false, error: "INVALID_KEY", message: "KEY NOT FOUND" });
      await found.ref.update({ status: "revoked", revokedAt: now, revokedBy: actor, updatedAt: now });
      await audit("key_revoked", { key, actor, ip });
      return res.status(200).json({ success: true, key, status: "REVOKED" });
    }

    /* ---------- EXTEND ---------- */
    if (action === "extendKey") {
      const key = normalizeKey(body.key);
      const days = positiveDays(body.addDays);
      if (!days) return res.status(400).json({ success: false, error: "BAD_REQUEST", message: `Tambahan hari harus 0-${MAX_DURATION_DAYS}.` });
      const found = KEY_RE.test(key) ? await findKey(key) : null;
      if (!found) return res.status(404).json({ success: false, error: "INVALID_KEY", message: "KEY NOT FOUND" });
      const state = statusOf(found.val, now);
      if (state === "REVOKED" || state === "DISABLED") return res.status(400).json({ success: false, error: "KEY_REVOKED", message: "Key dicabut/nonaktif. Enable dulu sebelum diperpanjang." });
      const currentExpiry = Number(found.val.expiresAt || 0);
      if (currentExpiry <= 0) return res.status(400).json({ success: false, error: "BAD_REQUEST", message: "Key ini tidak memiliki masa aktif." });
      const expiresAt = Math.max(now, currentExpiry) + Math.round(days * DAY_MS);
      const createdAt = Number(found.val.createdAt || now);
      await found.ref.update({ expiresAt, durationMs: expiresAt - createdAt, updatedAt: now, extendedAt: now });
      await audit("key_extended", { key, actor, ip, meta: { addDays: days, expiresAt } });
      return res.status(200).json({ success: true, key, expiresAt });
    }

    /* ---------- UPDATE (ubah masa aktif / max device) ---------- */
    if (action === "updateKey") {
      const key = normalizeKey(body.key);
      const found = KEY_RE.test(key) ? await findKey(key) : null;
      if (!found) return res.status(404).json({ success: false, error: "INVALID_KEY", message: "KEY NOT FOUND" });
      const hasDays = body.durationDays !== undefined && body.durationDays !== "" && body.durationDays !== null;
      const hasMax = body.maxDevices !== undefined && body.maxDevices !== "" && body.maxDevices !== null;
      if (!hasDays && !hasMax) return res.status(400).json({ success: false, error: "BAD_REQUEST", message: "Isi durationDays dan/atau maxDevices." });

      const update = { updatedAt: now };
      const meta = {};
      if (hasMax) {
        const raw = Math.floor(Number(body.maxDevices));
        const allowUnlimited = found.node === "keys"; // 0 = unlimited hanya untuk stok lama
        if (!Number.isFinite(raw) || raw > MAX_DEVICES_LIMIT || raw < (allowUnlimited ? 0 : 1)) {
          return res.status(400).json({ success: false, error: "BAD_REQUEST", message: `Maximum device harus ${allowUnlimited ? 0 : 1}-${MAX_DEVICES_LIMIT}.` });
        }
        update.maxDevices = raw;
        meta.maxDevices = raw;
      }
      if (hasDays) {
        const days = positiveDays(body.durationDays);
        if (!days) return res.status(400).json({ success: false, error: "BAD_REQUEST", message: `Masa aktif harus 0-${MAX_DURATION_DAYS} hari.` });
        if (found.node === "licenses") {
          // Masa aktif baru dihitung sejak key dibuat.
          const createdAt = Number(found.val.createdAt || now);
          update.durationMs = Math.round(days * DAY_MS);
          update.expiresAt = createdAt + update.durationMs;
          meta.durationMs = update.durationMs;
          meta.expiresAt = update.expiresAt;
        } else {
          // Stok lama: durasi dihitung per device saat claim, jadi hanya berlaku untuk device berikutnya.
          update.durationDays = days;
          meta.durationDays = days;
        }
      }
      await found.ref.update(update);
      await audit("key_updated", { key, actor, ip, meta });
      return res.status(200).json({ success: true, key, ...meta });
    }

    /* ---------- DELETE ---------- */
    if (action === "deleteKey") {
      const key = normalizeKey(body.key);
      const found = KEY_RE.test(key) ? await findKey(key) : null;
      if (!found) return res.status(404).json({ success: false, error: "INVALID_KEY", message: "KEY NOT FOUND" });
      if (found.node === "licenses") {
        const claims = found.val.claims && typeof found.val.claims === "object" ? Object.keys(found.val.claims) : [];
        await Promise.all(claims.map(async hash => {
          const idx = db.ref(`deviceKeys/${hash}`);
          if ((await idx.get()).val() === key) await idx.remove();
        }));
      }
      await found.ref.remove();
      await audit("key_deleted", { key, actor, ip });
      return res.status(200).json({ success: true, key });
    }

    /* ---------- AUDIT LOG ---------- */
    if (action === "listAudit") {
      const size = Math.min(500, Math.max(1, Math.floor(Number(body.limit) || 100)));
      const snap = await db.ref("auditLogs").orderByKey().limitToLast(size).get();
      const entries = [];
      snap.forEach(child => { entries.push({ id: child.key, ...child.val() }); });
      entries.reverse();
      return res.status(200).json({ success: true, logs: entries });
    }

    /* ---------- APP CONTROL ---------- */
    if (action === "saveSystem") {
      const maintenance = body.maintenance === true;
      const updateMode = body.updateMode === true;
      const maintenanceMessage = String(body.maintenanceMessage || "Sedang maintenance, silakan coba lagi nanti.").slice(0, 500);
      const updateMessage = String(body.updateMessage || "Silakan update ke versi terbaru.").slice(0, 500);
      const version = String(body.version || "").slice(0, 50);
      const downloadUrl = String(body.downloadUrl || "").slice(0, 1000);
      // update (bukan set) supaya /system/announcement tidak ikut terhapus
      await db.ref("system").update({ maintenance, updateMode, maintenanceMessage, updateMessage, version, downloadUrl, updatedAt: now });
      await audit("admin_system_saved", { actor, ip, meta: { maintenance, updateMode, version } });
      return res.status(200).json({ success: true, message: "System settings berhasil disimpan." });
    }

    /* ---------- ANNOUNCEMENT ---------- */
    if (action === "saveAnnouncement") {
      const enabled = body.enabled === true;
      const title = String(body.title || "PENGUMUMAN").trim().slice(0, 100);
      const message = String(body.message || "").trim().slice(0, 2000);
      await db.ref("system/announcement").set({ enabled, title, message, updatedAt: now });
      await audit("admin_announcement_saved", { actor, ip, meta: { enabled } });
      return res.status(200).json({ success: true, message: "Announcement berhasil disimpan.", announcement: { enabled, title, message } });
    }

    return res.status(400).json({ success: false, error: "BAD_REQUEST", message: "UNKNOWN ACTION" });
  } catch (error) {
    console.error("ADMIN ERROR", error);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      error: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "SERVER_ERROR",
      message: status === 500 ? "SERVER ERROR" : error.message
    });
  }
}
