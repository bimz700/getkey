import crypto from "node:crypto";
import { db } from "./firebase.js";
import { cors, fail, getIp } from "./_lib/util.js";
import { rateLimit } from "./_lib/ratelimit.js";
import { audit } from "./_lib/audit.js";

function cleanToken(v) {
  const s = String(v || "").trim();
  return /^[A-Za-z0-9_-]{4,80}$/.test(s) ? s : "";
}
function cleanSession(v) {
  const s = String(v || "").trim();
  return /^[A-Za-z0-9_-]{32,128}$/.test(s) ? s : "";
}
function cookieValue(req, name) {
  const raw = String(req.headers.cookie || "");
  const match = raw.split(";").map(x => x.trim()).find(x => x.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}
function html(res, status, title, message) {
  res.status(status).setHeader("Content-Type", "text/html; charset=utf-8");
  return res.end(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;background:#090909;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}.box{width:min(460px,calc(100% - 32px));box-sizing:border-box;padding:32px;text-align:center;border:1px solid #2a2a2a;border-radius:18px;background:#111}h1{font-size:22px}p{color:#aaa;line-height:1.6}a{display:inline-block;margin-top:14px;padding:12px 18px;border-radius:10px;background:#fff;color:#000;text-decoration:none;font-weight:700}</style></head><body><main class="box"><h1>${title}</h1><p>${message}</p><a href="/get-key">GET NEW LINK</a></main></body></html>`);
}
function newToken(bytes = 9) { return crypto.randomBytes(bytes).toString("base64url"); }

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "POST") return fail(res, "METHOD_NOT_ALLOWED");
  try {
    const limit = await rateLimit(req, "shortlink", 30, 60000);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfter));
      return fail(res, "RATE_LIMITED", "Terlalu banyak permintaan. Coba lagi nanti.");
    }
    const token = cleanToken(req.query?.token || req.body?.token);
    if (!token) return html(res, 400, "INVALID LINK", "Short link tidak valid.");
    const ref = db.ref(`getKeyLinks/${token}`);
    const snap = await ref.get();
    if (!snap.exists()) return html(res, 404, "INVALID LINK", "Short link tidak ditemukan.");
    const record = snap.val() || {};
    const now = Date.now();
    if (Number(record.expiresAt || 0) > 0 && now >= Number(record.expiresAt)) return html(res, 410, "LINK EXPIRED", "Short link ini sudah kedaluwarsa.");
    if (record.usedAt) return html(res, 410, "LINK ALREADY USED", "Short link ini sudah pernah digunakan.");

    const totalSteps = Math.max(1, Number(record.totalSteps || 1));
    const step = Math.max(1, Number(record.step || 1));
    const flowId = String(record.flowId || "");
    let sessionId = cleanSession(cookieValue(req, "gk_flow_session"));
    let session = null;

    if (totalSteps > 1) {
      if (!flowId || step < 1 || step > totalSteps) return html(res, 400, "INVALID FLOW", "Konfigurasi short-link tidak valid.");
      if (step === 1) {
        // Step pertama boleh memulai session baru. Jika ada session lama, jangan pakai ulang progresnya.
        sessionId = newToken(24);
        session = { flowId, currentStep: 0, createdAt: now, expiresAt: Number(record.expiresAt || 0) || now + 86400000 };
      } else {
        if (!sessionId) return html(res, 403, "STEP LOCKED", "Selesaikan short link sebelumnya terlebih dahulu.");
        const sessionSnap = await db.ref(`getKeySessions/${sessionId}`).get();
        session = sessionSnap.val() || null;
        if (!session || session.flowId !== flowId || Number(session.currentStep || 0) !== step - 1 || (Number(session.expiresAt || 0) > 0 && now >= Number(session.expiresAt))) {
          return html(res, 403, "STEP LOCKED", "Selesaikan short link sebelumnya terlebih dahulu.");
        }
      }
    }

    const result = await ref.transaction(current => {
      if (!current || current.usedAt) return;
      if (Number(current.expiresAt || 0) > 0 && now >= Number(current.expiresAt)) return;
      return { ...current, usedAt: now, usedIp: getIp(req) || "", updatedAt: now };
    });
    if (!result.committed) return html(res, 410, "LINK ALREADY USED", "Short link ini sudah pernah digunakan.");

    const saved = result.snapshot.val() || {};
    const destination = String(saved.destination || "");
    if (!/^https?:\/\//i.test(destination) && !destination.startsWith("/")) return html(res, 500, "INVALID DESTINATION", "Destination short link tidak valid.");

    if (totalSteps > 1) {
      if (step === 1) {
        await db.ref(`getKeySessions/${sessionId}`).set({ ...session, currentStep: 1, updatedAt: now });
      } else {
        await db.ref(`getKeySessions/${sessionId}`).update({ currentStep: step, updatedAt: now });
      }
      res.setHeader("Set-Cookie", `gk_flow_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(60, Math.ceil(((Number(saved.expiresAt || 0) || now + 86400000) - now) / 1000))}`);
    }

    await audit("shortlink_used", { actor: "public", ip: getIp(req), meta: { token, flowId, step, totalSteps } });
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, destination);
  } catch (error) {
    console.error("SHORTLINK ERROR", error);
    return html(res, 500, "SERVER ERROR", "Terjadi kesalahan server. Coba lagi nanti.");
  }
}
