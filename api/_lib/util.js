import crypto from "node:crypto";

export const DAY_MS = 86400000;
export const DEFAULT_DURATION_MS = DAY_MS; // default: 1 hari
export const DEFAULT_MAX_DEVICES = 1; // default: 1 device
export const MAX_DURATION_DAYS = 3650;
export const MAX_DEVICES_LIMIT = 100000;

/* Error code -> [HTTP status, pesan default] */
export const ERRORS = {
  INVALID_KEY: [404, "Key tidak ditemukan atau formatnya salah."],
  KEY_EXPIRED: [403, "Key sudah kedaluwarsa."],
  KEY_REVOKED: [403, "Key sudah dicabut atau dinonaktifkan."],
  DEVICE_NOT_ALLOWED: [403, "Device tidak diizinkan untuk key ini."],
  MAX_DEVICES_REACHED: [403, "Batas maksimum device untuk key ini sudah tercapai."],
  RATE_LIMITED: [429, "Terlalu banyak permintaan. Coba lagi beberapa saat lagi."],
  UNAUTHORIZED: [401, "Tidak terautentikasi."],
  FORBIDDEN: [403, "Akses ditolak."],
  BAD_REQUEST: [400, "Permintaan tidak valid."],
  METHOD_NOT_ALLOWED: [405, "Method tidak diizinkan."],
  MAINTENANCE: [503, "Sedang maintenance."],
  SERVER_ERROR: [500, "Terjadi kesalahan pada server."]
};

export function fail(res, code, message, extra = {}) {
  const [status, fallback] = ERRORS[code] || ERRORS.SERVER_ERROR;
  return res.status(status).json({
    success: false,
    valid: false,
    error: code,
    message: message || fallback,
    ...extra
  });
}

export function cors(res, headers = "Content-Type, X-Device-Identifier") {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", headers);
  res.setHeader("Cache-Control", "no-store");
}

export function readBody(req) {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body || "{}") || {}; } catch { return {}; }
  }
  return req.body && typeof req.body === "object" ? req.body : {};
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function getIp(req) {
  const real = String(req.headers["x-real-ip"] || "").trim();
  if (real) return real;
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || "unknown-ip";
}

const BAD_DEVICE_IDS = new Set([
  "", "unknown", "unknown-device", "unknown_device", "null", "undefined",
  "none", "n/a", "na", "0", "device", "android", "test"
]);

/*
 * Validasi device identifier lalu hash di server (sha256, sama dengan sistem lama
 * sehingga claim lama tetap cocok). Mengembalikan null jika tidak valid.
 */
export function deviceFrom(req, body = {}) {
  const raw = String(req.headers["x-device-identifier"] || body.deviceId || "").trim();
  const lower = raw.toLowerCase();
  if (raw.length < 8 || raw.length > 256 || BAD_DEVICE_IDS.has(lower)) return null;
  if (/^(.)\1+$/.test(raw)) return null; // mis. "00000000"
  return { raw, hash: sha256(raw) };
}

export function shortDevice(hash) {
  return String(hash || "").slice(0, 12);
}
