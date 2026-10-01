import { db, adminAuth } from "./firebase.js";
import { randomBytes } from "node:crypto";
import { requireAdmin, assertOwner } from "./auth.js";
import { isOwnerEmail, sanitizeLimits, sanitizePermissions, effectiveLimits } from "./_lib/users.js";
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
        deviceIndex: Number(value.deviceIndex || 0),
        model: String(value.model || ""),
        model: String(value.model || "")
      };
    })
    .sort((a, b) => b.claimedAt - a.claimedAt);
}

async function readKeys() {
  const now = Date.now();
  const [licenses, legacy, users] = await Promise.all([db.ref("licenses").get(), db.ref("keys").get(), db.ref("users").get()]);
  const people = users.val() || {};
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
        sellerId: value.sellerId || "",
        sellerName: value.sellerId ? String(people[value.sellerId]?.name || people[value.sellerId]?.email || "(akun dihapus)") : "",
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


const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

function badRequest(res, message, status = 400) {
  return res.status(status).json({ success: false, error: "BAD_REQUEST", message });
}

function publicUser(uid, value) {
  const permissions = sanitizePermissions(value?.permissions);
  const owner = isOwnerEmail(value?.email);
  return {
    uid,
    email: String(value?.email || ""),
    name: String(value?.name || ""),
    active: value?.active === true,
    owner,
    permissions: owner ? { seller: true, admin: true, owner: true } : permissions,
    limits: effectiveLimits(value),
    customLimits: value?.limits || {},
    createdAt: Number(value?.createdAt || 0),
    updatedAt: Number(value?.updatedAt || 0)
  };
}

/* Akun owner (ADMIN_EMAIL) dilindungi: tidak bisa diubah/dinonaktifkan/dihapus lewat API. */
async function targetIsOwner(uid, record) {
  if (isOwnerEmail(record?.email)) return true;
  try {
    return isOwnerEmail((await adminAuth.getUser(uid)).email);
  } catch {
    return false;
  }
}

async function setAuthDisabled(uid, disabled) {
  try {
    await adminAuth.updateUser(uid, { disabled });
    if (disabled) await adminAuth.revokeRefreshTokens(uid);
  } catch (error) {
    console.error("AUTH UPDATE ERROR", error);
  }
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
      const extra = {};
      if (body.durationDays !== undefined && body.durationDays !== "") {
        const d = Number(body.durationDays);
        if (!Number.isFinite(d) || d < 0 || d > MAX_DURATION_DAYS) return res.status(400).json({ success: false, error: "BAD_REQUEST", message: `durationDays harus 0-${MAX_DURATION_DAYS}.` });
        extra.durationDays = d; // masa aktif per device (semantik lama), 0 = tanpa batas
      }
      await ref.set({
        ...current,
        ...extra,
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
      // Stok lama tetap ditandai "disabled" agar APK lama (yang hanya mengecek "disabled") ikut menolak.
      await found.ref.update({ status: found.node === "keys" ? "disabled" : "revoked", revokedAt: now, revokedBy: actor, updatedAt: now });
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

    /* ---------- DELETE ---------- */
    if (action === "deleteKey") {
      const key = normalizeKey(body.key);
      const found = KEY_RE.test(key) ? await findKey(key) : null;
      if (!found) return res.status(404).json({ success: false, error: "INVALID_KEY", message: "KEY NOT FOUND" });
      if (found.node === "licenses") {
        const issuer = found.val.issuedTo;
        if (issuer) {
          const idx = db.ref(`deviceKeys/${issuer}`);
          if ((await idx.get()).val() === key) await idx.remove();
        }
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

    /* ---------- USER MANAGEMENT (OWNER ONLY) ---------- */
    if (["listUsers", "saveUser", "setUserActive", "deleteUser"].includes(action)) {
      assertOwner(admin);

      if (action === "listUsers") {
        const snap = await db.ref("users").get();
        const users = Object.entries(snap.val() || {})
          .map(([uid, value]) => publicUser(uid, value))
          .sort((a, b) => Number(b.owner) - Number(a.owner) || a.email.localeCompare(b.email));
        return res.status(200).json({ success: true, users });
      }

      if (action === "saveUser") {
        const userEmail = String(body.email || "").trim().toLowerCase();
        const wantName = body.name === undefined ? null : String(body.name).trim().slice(0, 100);
        const password = body.password === undefined || body.password === "" ? null : String(body.password);
        const permissions = sanitizePermissions(body.permissions);
        const wantActive = body.active === undefined ? null : body.active === true;

        if (!EMAIL_RE.test(userEmail)) return badRequest(res, "Email tidak valid.");
        if (isOwnerEmail(userEmail)) return badRequest(res, "Akun owner dilindungi dan tidak bisa diubah.", 403);
        if (!permissions.admin && !permissions.seller) return badRequest(res, "Pilih minimal satu akses (Admin / Seller).");
        if (password !== null && (password.length < 8 || password.length > 128)) return badRequest(res, "Password harus 8-128 karakter.");

        let authUser = null;
        try {
          authUser = await adminAuth.getUserByEmail(userEmail);
        } catch (error) {
          if (error.code !== "auth/user-not-found") throw error;
        }

        let created = false;
        if (!authUser) {
          if (password === null) return badRequest(res, "Password wajib untuk akun baru (min. 8 karakter).");
          try {
            authUser = await adminAuth.createUser({ email: userEmail, password, displayName: wantName || undefined, disabled: wantActive === false });
            created = true;
          } catch (error) {
            if (error.code === "auth/invalid-email" || error.code === "auth/invalid-password") return badRequest(res, "Email atau password tidak valid.");
            throw error;
          }
        } else if (password !== null) {
          await adminAuth.updateUser(authUser.uid, { password });
        }

        if (await targetIsOwner(authUser.uid, { email: userEmail })) return badRequest(res, "Akun owner dilindungi dan tidak bisa diubah.", 403);

        const ref = db.ref(`users/${authUser.uid}`);
        const previous = (await ref.get()).val() || {};
        // Field yang tidak dikirim dipertahankan (mis. update permission tidak mengaktifkan ulang akun nonaktif).
        const name = wantName === null ? String(previous.name || "") : wantName;
        const active = wantActive === null ? previous.active !== false : wantActive;
        const limits = body.limits === undefined ? sanitizeLimits(previous.limits) : sanitizeLimits(body.limits);
        const record = {
          email: userEmail,
          name,
          active,
          permissions,
          createdAt: Number(previous.createdAt || now),
          updatedAt: now,
          createdBy: previous.createdBy || admin.uid
        };
        if (Object.keys(limits).length) record.limits = limits;
        await ref.set(record);
        await setAuthDisabled(authUser.uid, !active);
        await audit(created ? "user_created" : "user_updated", { actor, ip, target: userEmail, meta: { admin: permissions.admin, seller: permissions.seller, active } });
        return res.status(200).json({ success: true, user: publicUser(authUser.uid, record), created });
      }

      const uid = String(body.uid || "");
      if (!/^[A-Za-z0-9]{6,128}$/.test(uid)) return badRequest(res, "UID tidak valid.");
      const ref = db.ref(`users/${uid}`);
      const record = (await ref.get()).val();
      if (!record) return res.status(404).json({ success: false, error: "BAD_REQUEST", message: "USER NOT FOUND" });
      if (uid === admin.uid || (await targetIsOwner(uid, record))) return badRequest(res, "Akun owner dilindungi dan tidak bisa diubah.", 403);

      if (action === "setUserActive") {
        const active = body.active === true;
        await ref.update({ active, updatedAt: now });
        await setAuthDisabled(uid, !active);
        await audit(active ? "user_activated" : "user_deactivated", { actor, ip, target: record.email });
        return res.status(200).json({ success: true, uid, active });
      }

      // deleteUser: key milik seller TIDAK dihapus (tetap bisa dikelola Admin/Owner).
      await ref.remove();
      try { await adminAuth.deleteUser(uid); } catch (error) { if (error.code !== "auth/user-not-found") throw error; }
      await audit("user_deleted", { actor, ip, target: record.email });
      return res.status(200).json({ success: true, uid });
    }

    /* ---------- GET KEY SHORT LINKS ---------- */
    if (["listShortLinks", "createShortLink", "deleteShortLink"].includes(action)) {
      assertOwner(admin);

      if (action === "listShortLinks") {
        const snap = await db.ref("getKeyLinks").get();
        const links = Object.entries(snap.val() || {}).map(([token, value]) => ({
          token,
          destination: String(value?.destination || ""),
          durationMs: Number(value?.durationMs || 0),
          expiresAt: Number(value?.expiresAt || 0),
          usedAt: Number(value?.usedAt || 0),
          flowId: String(value?.flowId || ""),
          step: Number(value?.step || 1),
          totalSteps: Number(value?.totalSteps || 1),
          createdAt: Number(value?.createdAt || 0)
        })).sort((a,b) => b.createdAt - a.createdAt);
        return res.status(200).json({ success: true, links });
      }

      if (action === "deleteShortLink") {
        const token = String(body.token || "").trim();
        if (!/^[A-Za-z0-9_-]{4,80}$/.test(token)) return badRequest(res, "Short code tidak valid.");
        await db.ref(`getKeyLinks/${token}`).remove();
        await audit("shortlink_deleted", { actor, ip, meta: { token } });
        return res.status(200).json({ success: true, token });
      }

      const destination = String(body.destination || "").trim();
      if (!destination || !(destination.startsWith("/") || /^https?:\/\//i.test(destination))) return badRequest(res, "Destination harus URL http(s) atau path internal.");
      const amount = Number(body.durationAmount);
      const unit = String(body.durationUnit || "hour").toLowerCase();
      const unitMs = unit === "minute" ? 60000 : unit === "day" ? 86400000 : 3600000;
      if (!Number.isFinite(amount) || amount <= 0 || amount > 3650) return badRequest(res, "Durasi tidak valid.");
      const durationMs = Math.round(amount * unitMs);
      let token = String(body.token || "").trim();
      if (token && !/^[A-Za-z0-9_-]{4,80}$/.test(token)) return badRequest(res, "Short code tidak valid.");
      for (let attempt = 0; !token || attempt < 5; attempt += 1) {
        if (!token) token = randomBytes(6).toString("base64url");
        const exists = await db.ref(`getKeyLinks/${token}`).get();
        if (!exists.exists()) break;
        if (body.token) return res.status(409).json({ success: false, error: "BAD_REQUEST", message: "Short code sudah digunakan." });
        token = "";
      }
      if (!token) return fail(res, "SERVER_ERROR");
      const record = {
        token,
        destination,
        durationMs,
        expiresAt: now + durationMs,
        usedAt: 0,
        createdAt: now,
        updatedAt: now,
        createdBy: admin.uid,
        flowId: String(body.flowId || ""),
        step: Math.max(1, Math.floor(Number(body.step) || 1)),
        totalSteps: Math.max(1, Math.floor(Number(body.totalSteps) || 1))
      };
      await db.ref(`getKeyLinks/${token}`).set(record);
      await audit("shortlink_created", { actor, ip, meta: { token, durationMs, flowId: record.flowId, step: record.step, totalSteps: record.totalSteps } });
      return res.status(200).json({ success: true, link: { ...record, url: `/s/${token}` } });
    }

    /* ---------- GET KEY PUBLIC FLOW CONFIG ---------- */
    if (action === "saveGetKeyFlow") {
      assertOwner(admin);
      const parseDuration = (amount, unit) => {
        const n = Number(amount);
        const u = String(unit || "hour").toLowerCase();
        const ms = u === "minute" ? 60000 : u === "day" ? 86400000 : 3600000;
        if (!Number.isFinite(n) || n <= 0 || n > 3650) throw new Error("Durasi tidak valid.");
        return Math.round(n * ms);
      };
      const singleMs = parseDuration(body.singleAmount, body.singleUnit);
      const doubleMs = parseDuration(body.doubleAmount, body.doubleUnit);
      const finalDestination = String(body.finalDestination || "/get-key?final=1").trim();
      if (!(finalDestination.startsWith("/") || /^https?:\/\//i.test(finalDestination))) return badRequest(res, "Final destination harus URL http(s) atau path internal.");
      const config = {
        single: { enabled: body.singleEnabled === true, durationMs: singleMs, finalDestination },
        double: { enabled: body.doubleEnabled === true, durationMs: doubleMs, finalDestination },
        updatedAt: now,
        updatedBy: admin.uid
      };
      await db.ref("system/getKeyFlow").set(config);
      await audit("getkey_flow_config_saved", { actor, ip, meta: { single: config.single.enabled, double: config.double.enabled, singleMs, doubleMs } });
      return res.status(200).json({ success: true, config });
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
      return res.status(200).json({ success: true, message: "System settings berhasil disimpan." });
    }

    /* ---------- ANNOUNCEMENT ---------- */
    if (action === "saveAnnouncement") {
      const enabled = body.enabled === true;
      const title = String(body.title || "PENGUMUMAN").trim().slice(0, 100);
      const message = String(body.message || "").trim().slice(0, 2000);
      await db.ref("system/announcement").set({ enabled, title, message, updatedAt: now });
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
