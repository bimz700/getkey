import crypto from "node:crypto";
import { db } from "../firebase.js";

/*
 * Penyimpanan key:
 *   /keys/{KEY}      -> stok key lama (dikelola admin, kompatibel dengan sistem lama)
 *   /licenses/{KEY}  -> key hasil Generate Key baru (privat, hanya server)
 * Bentuk record sama: status, maxDevices, createdAt, expiresAt, claims, dst.
 */
export const KEY_RE = /^[A-Z0-9][A-Z0-9_-]{2,100}$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 karakter, tanpa I/O/0/1

export function normalizeKey(value) {
  return String(value || "").trim().toUpperCase();
}

export function generateKey() {
  const part = () =>
    Array.from({ length: 4 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join("");
  return `BIMZ-${part()}-${part()}-${part()}`;
}

/* ACTIVE | EXPIRED | REVOKED | DISABLED */
export function statusOf(record, now = Date.now()) {
  if (!record || typeof record !== "object") return "INVALID";
  if (record.status === "revoked" || Number(record.revokedAt || 0) > 0) return "REVOKED";
  if (record.status === "disabled") return "DISABLED";
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
    devices: deviceUsage(record)
  };
}

/* Cari key di /licenses lalu /keys. */
export async function findKey(key) {
  for (const node of ["licenses", "keys"]) {
    const ref = db.ref(`${node}/${key}`);
    const snap = await ref.get();
    if (snap.exists()) return { node, ref, key, val: snap.val() || {} };
  }
  return null;
}

/*
 * Validasi + device binding dalam SATU transaction (atomic), sehingga dua
 * request bersamaan tidak bisa melewati batas maxDevices.
 * Mengembalikan { code } saat ditolak, atau { code: null, bound, used, max, val }.
 */
export async function verifyAndBind(node, key, deviceHash, ip, now = Date.now()) {
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
      if (status === "REVOKED" || status === "DISABLED") {
        verdict = { code: "KEY_REVOKED" };
        return;
      }
      if (status === "EXPIRED") {
        verdict = { code: "KEY_EXPIRED" };
        return;
      }
      const claims = current.claims && typeof current.claims === "object" ? current.claims : {};
      const used = Object.keys(claims).length;
      const max = Number(current.maxDevices || 0);

      if (Object.prototype.hasOwnProperty.call(claims, deviceHash)) {
        verdict = { code: null, bound: false, used, max };
        return current;
      }
      if (max > 0 && used >= max) {
        verdict = { code: max === 1 ? "DEVICE_NOT_ALLOWED" : "MAX_DEVICES_REACHED", used, max };
        return;
      }
      verdict = { code: null, bound: true, used: used + 1, max };
      return {
        ...current,
        claims: {
          ...claims,
          [deviceHash]: { device: deviceHash, ip, claimedAt: now, deviceIndex: used + 1 }
        },
        lastClaimAt: now
      };
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
