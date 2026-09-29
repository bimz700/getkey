import crypto from "node:crypto";
import { db } from "../firebase.js";
import { DAY_MS } from "./util.js";

/*
 * Penyimpanan key:
 *   /keys/{KEY}      -> stok key lama (dikelola admin, kompatibel dengan aplikasi lama)
 *   /licenses/{KEY}  -> key hasil Generate Key (privat, hanya server)
 * Bentuk record sama: status, maxDevices, createdAt, expiresAt, claims, dst.
 */
export const KEY_RE = /^[A-Z0-9][A-Z0-9_-]{2,100}$/;
export const LOOSE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,100}$/; // key lama yang mungkin bukan huruf besar
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 karakter, tanpa I/O/0/1

export function normalizeKey(value) {
  return String(value || "").trim().toUpperCase();
}

export function generateKey() {
  const part = () =>
    Array.from({ length: 4 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join("");
  return `BIMZ-${part()}-${part()}-${part()}`;
}

/* ACTIVE | EXPIRED | REVOKED | DISABLED  (status dibaca tanpa peduli huruf besar/kecil) */
export function statusOf(record, now = Date.now()) {
  if (!record || typeof record !== "object") return "INVALID";
  const status = String(record.status || "").toLowerCase();
  if (status === "revoked" || Number(record.revokedAt || 0) > 0) return "REVOKED";
  if (status === "disabled") return "DISABLED";
  const expiresAt = Number(record.expiresAt || 0);
  if (expiresAt > 0 && now >= expiresAt) return "EXPIRED";
  return "ACTIVE";
}

export function deviceUsage(record) {
  const claims = record?.claims && typeof record.claims === "object" ? record.claims : {};
  return { used: Object.keys(claims).length, max: Number(record?.maxDevices || 0) };
}

export function describe(record, now = Date.now()) {
  return {
    status: statusOf(record, now),
    expiresAt: Number(record?.expiresAt || 0),
    durationMs: Number(record?.durationMs || 0),
    maxDevices: Number(record?.maxDevices || 0),
    devices: deviceUsage(record)
  };
}

/* Cari key di /licenses lalu /keys. Beberapa nama boleh dicoba (mis. huruf besar lalu persis seperti diketik). */
export async function findKey(...names) {
  for (const key of [...new Set(names.filter(Boolean))]) {
    for (const node of ["licenses", "keys"]) {
      const ref = db.ref(`${node}/${key}`);
      const snap = await ref.get();
      if (snap.exists()) return { node, ref, key, val: snap.val() || {} };
    }
  }
  return null;
}

const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);

/*
 * Kompatibilitas key lama: aplikasi Android lama menyimpan expiry PER DEVICE di
 * claims/{device}.expiredAt = claimedAt + durationDays. Itu hanya berlaku jika key
 * punya durationDays > 0 (klaim lama tanpa durationDays berisi expiredAt = waktu klaim,
 * yang TIDAK boleh dianggap kedaluwarsa).
 */
function legacyDeviceExpiry(record, claim) {
  const days = Number(record?.durationDays || 0);
  if (!(days > 0)) return 0;
  const expiredAt = Number(claim?.expiredAt || 0);
  if (expiredAt > 0) return expiredAt;
  const claimedAt = Number(claim?.claimedAt || 0);
  return claimedAt > 0 ? claimedAt + days * DAY_MS : 0;
}

function effectiveExpiry(record, deviceExpiry) {
  const values = [Number(record?.expiresAt || 0), Number(deviceExpiry || 0)].filter(v => v > 0);
  return values.length ? Math.min(...values) : 0;
}

function indexOfClaim(claims, id) {
  const own = Number(claims[id]?.deviceIndex || 0);
  if (own > 0) return own;
  const order = Object.keys(claims).sort(
    (a, b) => Number(claims[a]?.claimedAt || 0) - Number(claims[b]?.claimedAt || 0) || (a < b ? -1 : 1)
  );
  return order.indexOf(id) + 1;
}

/*
 * Validasi + device binding dalam SATU transaction (atomic): dua request bersamaan
 * tidak bisa melewati maxDevices.
 * device = { hash, raw, model }. Claim lama yang tersimpan dengan ANDROID_ID mentah
 * (aplikasi lama menulis langsung) dikenali sebagai device yang sama, tanpa diubah.
 * Claim baru SELALU disimpan dengan hash.
 * Hasil: { code } saat ditolak, atau { code:null, bound, used, max, deviceIndex, expiresAt, val }.
 */
export async function verifyAndBind(node, key, device, ip, now = Date.now()) {
  const ref = db.ref(`${node}/${key}`);
  await ref.get(); // isi cache lokal agar pass pertama transaction membaca data asli

  let verdict = { code: "SERVER_ERROR" };
  const result = await ref.transaction(
    current => {
      if (current === null) {
        verdict = { code: "INVALID_KEY" };
        return null;
      }
      const status = statusOf(current, now);
      if (status === "REVOKED") { verdict = { code: "KEY_REVOKED" }; return; }
      if (status === "DISABLED") { verdict = { code: "KEY_DISABLED" }; return; }
      if (status === "EXPIRED") { verdict = { code: "KEY_EXPIRED" }; return; }

      const claims = current.claims && typeof current.claims === "object" ? current.claims : {};
      const used = Object.keys(claims).length;
      const max = Number(current.maxDevices || 0);
      const ownId = has(claims, device.hash) ? device.hash : has(claims, device.raw) ? device.raw : null;

      if (ownId) {
        const deviceExpiry = legacyDeviceExpiry(current, claims[ownId]);
        if (deviceExpiry > 0 && now >= deviceExpiry) { verdict = { code: "KEY_EXPIRED" }; return; }
        verdict = { code: null, bound: false, used, max, deviceIndex: indexOfClaim(claims, ownId), expiresAt: effectiveExpiry(current, deviceExpiry) };
        return current;
      }

      if (max > 0 && used >= max) {
        verdict = { code: max === 1 ? "DEVICE_NOT_ALLOWED" : "MAX_DEVICES_REACHED", used, max };
        return;
      }

      const days = Number(current.durationDays || 0);
      const claim = { device: device.hash, ip, claimedAt: now, deviceIndex: used + 1 };
      if (device.model) claim.model = device.model;
      if (days > 0) claim.expiredAt = now + days * DAY_MS;
      verdict = { code: null, bound: true, used: used + 1, max, deviceIndex: used + 1, expiresAt: effectiveExpiry(current, claim.expiredAt || 0) };
      return { ...current, claims: { ...claims, [device.hash]: claim }, lastClaimAt: now };
    },
    undefined,
    false
  );

  if (verdict.code) return verdict;
  if (!result.committed || !result.snapshot.exists()) return { code: "SERVER_ERROR" };
  return { ...verdict, val: result.snapshot.val() };
}

/* Buat record baru hanya jika path masih kosong. Mengembalikan true jika dibuat. */
export async function createIfAbsent(node, key, record) {
  const ref = db.ref(`${node}/${key}`);
  await ref.get();
  const result = await ref.transaction(current => (current === null ? record : undefined), undefined, false);
  return result.committed && result.snapshot.exists() && result.snapshot.val()?.createdAt === record.createdAt;
}
