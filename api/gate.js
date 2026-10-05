import crypto from "node:crypto";
import { MANUAL_SHORT_LINK, accessTokenValid, gateConfigured, issueSession } from "./_lib/shortlink.js";

/*
 * GET /get-key  (rewrite di vercel.json -> /api/gate)
 *   tanpa ?access=        -> 302 ke MANUAL_SHORT_LINK
 *   ?access=TOKEN valid   -> 302 ke /get-key.html#s=<sesi bertanda tangan>
 *   ?access=... invalid   -> 403 (tanpa redirect otomatis, mencegah loop)
 * Refresh /get-key selalu tanpa token (dibersihkan di browser) -> kembali ke Short Link.
 */

const HOP_COOKIE = "gk_hop";
const SESSION_COOKIE = "gk_sid";
const MAX_HOPS = 3; // pengaman loop: maks 3 redirect ke Short Link dalam 60 detik

const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function hops(req) {
  const match = new RegExp(`(?:^|;\\s*)${HOP_COOKIE}=(\\d{1,2})`).exec(String(req.headers.cookie || ""));
  return match ? Number(match[1]) : 0;
}

function cookie(req, value, maxAge) {
  const secure = String(req.headers["x-forwarded-proto"] || "").includes("https") ? "; Secure" : "";
  return `${HOP_COOKIE}=${value}; Path=/get-key; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

function sessionCookie(req, value) {
  const secure = String(req.headers["x-forwarded-proto"] || "").includes("https") ? "; Secure" : "";
  // No Max-Age/Expires: browser-session cookie, not persistent storage.
  return `${SESSION_COOKIE}=${value}; Path=/get-key; HttpOnly; SameSite=Lax${secure}`;
}

function sessionBinding(req) {
  const match = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([0-9a-f]{64})`).exec(String(req.headers.cookie || ""));
  return match ? match[1] : "";
}

function page(res, status, title, text, withLink) {
  res.status(status).setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>MZMODZ — Get Key</title><link rel="stylesheet" href="/admin.css"><link rel="stylesheet" href="/get-key.css"></head><body><main class="wrap gk-wrap"><section class="card gk-card"><div class="brand">MZ<span>MODZ</span></div><p class="subtitle">GET KEY</p><p class="gk-lead">${esc(title)}</p><div class="gk-notice error">${esc(text)}</div>${withLink ? `<a class="gk-primary" style="text-decoration:none;display:flex;justify-content:center;align-items:center" href="${esc(MANUAL_SHORT_LINK)}">BUKA SHORT LINK</a>` : ""}</section></main></body></html>`);
}

function cryptoRandomHex() {
  return Array.from(crypto.randomBytes(32), b => b.toString(16).padStart(2, "0")).join("");
}

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD"].includes(req.method)) return res.status(405).end();

  if (!gateConfigured()) {
    return page(res, 503, "Akses belum dikonfigurasi", "GETKEY_ACCESS_TOKEN belum diatur di server. Hubungi admin.", false);
  }

  const raw = req.query?.access;
  const access = Array.isArray(raw) ? raw[0] : raw;

  if (access === undefined) {
    const count = hops(req);
    if (count >= MAX_HOPS) {
      res.setHeader("Set-Cookie", cookie(req, 0, 0));
      return page(res, 508, "Short Link tidak kembali dengan benar", "Short Link harus diarahkan kembali ke /get-key?access=TOKEN. Periksa tujuan (destination) Short Link.", true);
    }
    res.setHeader("Set-Cookie", cookie(req, count + 1, 60));
    res.setHeader("Location", MANUAL_SHORT_LINK);
    return res.status(302).end();
  }

  if (!accessTokenValid(access)) {
    return page(res, 403, "Akses ditolak", "Token akses tidak valid. Silakan lewati Short Link terlebih dahulu.", true);
  }

  const binding = cryptoRandomHex();
  res.setHeader("Set-Cookie", [cookie(req, 0, 0), sessionCookie(req, binding)]);
  res.setHeader("Location", `/get-key.html#s=${issueSession(binding)}`);
  return res.status(302).end();
}
