import { db } from "../firebase.js";

/*
 * Multi-permission (seller / admin / owner), tersimpan di /users/{uid}.
 * - OWNER ditentukan HANYA oleh env ADMIN_EMAIL (akun admin existing). Tidak bisa
 *   diberikan, diubah, atau dicabut lewat API/database -> tidak ada jalur privilege escalation.
 * - Admin = permissions.admin ATAU owner. Seller = permissions.seller ATAU owner.
 */
export const SELLER_DEFAULTS = { maxDurationDays: 365, maxDevices: 10 };
export const HARD_MAX = { maxDurationDays: 3650, maxDevices: 100000 };

export function ownerEmail() {
  return String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
}

export function isOwnerEmail(email) {
  const owner = ownerEmail();
  return Boolean(owner) && String(email || "").trim().toLowerCase() === owner;
}

/* owner TIDAK PERNAH bisa diset dari input; selalu false pada record tersimpan oleh API. */
export function sanitizePermissions(input) {
  return { seller: input?.seller === true, admin: input?.admin === true, owner: false };
}

function positiveInt(value, max) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : null;
}

export function sanitizeLimits(input) {
  const limits = {};
  const days = positiveInt(input?.maxDurationDays, HARD_MAX.maxDurationDays);
  const devices = positiveInt(input?.maxDevices, HARD_MAX.maxDevices);
  if (days) limits.maxDurationDays = days;
  if (devices) limits.maxDevices = devices;
  return limits;
}

export function effectiveLimits(record) {
  return {
    maxDurationDays: positiveInt(record?.limits?.maxDurationDays, HARD_MAX.maxDurationDays) || SELLER_DEFAULTS.maxDurationDays,
    maxDevices: positiveInt(record?.limits?.maxDevices, HARD_MAX.maxDevices) || SELLER_DEFAULTS.maxDevices
  };
}

/*
 * Menentukan hak akses dari token Firebase yang SUDAH diverifikasi.
 * Mengembalikan null jika akun tidak punya akses (tanpa record, nonaktif, atau tanpa permission).
 */
export async function resolvePrincipal(decoded) {
  const email = String(decoded?.email || "").trim().toLowerCase();
  const uid = String(decoded?.uid || "");

  if (isOwnerEmail(email)) {
    return { uid, email, name: String(decoded.name || "Owner"), owner: true, admin: true, seller: true, active: true, limits: { ...HARD_MAX } };
  }
  if (!uid) return null;

  const record = (await db.ref(`users/${uid}`).get()).val();
  if (!record || record.active !== true) return null;

  const permissions = sanitizePermissions(record.permissions);
  if (!permissions.admin && !permissions.seller) return null;

  return {
    uid,
    email,
    name: String(record.name || ""),
    owner: false,
    admin: permissions.admin,
    seller: permissions.seller,
    active: true,
    limits: effectiveLimits(record)
  };
}

export function panelsOf(principal) {
  const panels = [];
  if (principal.admin) panels.push("admin");
  if (principal.seller) panels.push("seller");
  return panels;
}
