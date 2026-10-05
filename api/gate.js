import { MANUAL_SHORT_LINK, gateConfigured, issueSession, issuePending, pendingState, refererOk } from "./_lib/shortlink.js";

/*
 * GET /get-key  (rewrite di vercel.json -> /api/gate)
 *   cookie pending valid & cukup lama  -> 302 ke /get-key.html#s=<sesi bertanda tangan>  (GET KEY tampil)
 *   cookie pending valid tapi terlalu cepat -> halaman "belum selesai" (TANPA redirect otomatis, mencegah loop)
 *   selain itu (belum lewat / refresh / buka lagi) -> set cookie pending + 302 ke MANUAL_SHORT_LINK
 * Cookie pending dihapus saat dipakai, jadi refresh / buka lagi selalu kembali ke Short Link.
 */

const PENDING_COOKIE = "gk_pending";
const HOP_COOKIE = "gk_hop";
const MAX_HOPS = 3; // pengaman loop: maks 3 redirect ke Short Link dalam 60 detik

const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function readCookie(req, name) {
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(String(req.headers.cookie || ""));
  return match ? match[1] : "";
}

function setCookie(req, name, value, maxAge) {
  const secure = String(req.headers["x-forwarded-proto"] || "").includes("https") ? "; Secure" : "";
  return `${name}=${value}; Path=/get-key; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

function page(res, status, title, text, withLink) {
  res.status(status).setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>MZMODZ — Get Key</title><link rel="stylesheet" href="/admin.css"><link rel="stylesheet" href="/get-key.css"></head><body><main class="wrap gk-wrap"><section class="card gk-card"><div class="brand">MZ<span>MODZ</span></div><p class="subtitle">GET KEY</p><p class="gk-lead">${esc(title)}</p><div class="gk-notice error">${esc(text)}</div>${withLink ? `<a class="gk-primary" style="text-decoration:none;display:flex;justify-content:center;align-items:center" href="${esc(MANUAL_SHORT_LINK)}">BUKA SHORT LINK</a>` : ""}</section></main></body></html>`);
}

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD"].includes(req.method)) return res.status(405).end();
  // HEAD / prefetch tidak boleh mengubah status gate (cookie tidak dipakai/dibuat).
  if (req.method === "HEAD" || /prefetch|prerender/i.test(String(req.headers["sec-purpose"] || req.headers["purpose"] || ""))) {
    return res.status(204).end();
  }

  if (!gateConfigured()) {
    return page(res, 503, "Akses belum dikonfigurasi", "FIREBASE_PRIVATE_KEY belum diatur di server. Hubungi admin.", false);
  }

  const state = pendingState(readCookie(req, PENDING_COOKIE));

  if (state === "ok" && refererOk(req.headers.referer)) {
    res.setHeader("Set-Cookie", [setCookie(req, PENDING_COOKIE, "", 0), setCookie(req, HOP_COOKIE, 0, 0)]);
    res.setHeader("Location", `/get-key.html#s=${issueSession()}`);
    return res.status(302).end();
  }

  if (state === "early") {
    return page(res, 403, "Short Link belum selesai", "Selesaikan Short Link terlebih dahulu, lalu Anda akan kembali ke halaman ini.", true);
  }

  // belum lewat / refresh / buka lagi / cookie kedaluwarsa atau tidak valid -> ke Short Link
  const hopRaw = /^\d{1,2}$/.test(readCookie(req, HOP_COOKIE)) ? Number(readCookie(req, HOP_COOKIE)) : 0;
  if (hopRaw >= MAX_HOPS) {
    res.setHeader("Set-Cookie", setCookie(req, HOP_COOKIE, 0, 0));
    return page(res, 508, "Short Link tidak kembali dengan benar", "Pastikan cookie browser aktif dan tujuan (destination) Short Link adalah /get-key.", true);
  }
  res.setHeader("Set-Cookie", [setCookie(req, PENDING_COOKIE, issuePending(), 1800), setCookie(req, HOP_COOKIE, hopRaw + 1, 60)]);
  res.setHeader("Location", MANUAL_SHORT_LINK);
  return res.status(302).end();
}
