import crypto from "node:crypto";

/*
 * ======================= SHORT LINK MANUAL (GATE GET KEY) =======================
 * Ganti URL di bawah ini jika ingin mengganti Short Link. Hanya ini yang perlu diubah.
 *
 * Tujuan akhir (destination) Short Link di dashboard penyedia short link harus:
 *     https://DOMAIN-ANDA/get-key?access=<GETKEY_ACCESS_TOKEN>
 * GETKEY_ACCESS_TOKEN = Environment Variable Vercel (min. 16 karakter, acak, rahasia).
 */
export const MANUAL_SHORT_LINK = "https://sfl.gl/BFeVm8DP";

/* Masa berlaku sesi GET KEY di memori halaman (setelah itu harus lewat Short Link lagi). */
export const SESSION_TTL_MS = 30 * 60 * 1000;

const digest = value => crypto.createHash("sha256").update(String(value)).digest();

/* Kunci penandatangan sesi diturunkan dari FIREBASE_PRIVATE_KEY (hanya ada di server). */
function signingKey() {
  const base = process.env.FIREBASE_PRIVATE_KEY || "";
  return base ? crypto.createHmac("sha256", base).update("mzmodz-getkey-gate-v1").digest() : null;
}

function sign(payload) {
  return crypto.createHmac("sha256", signingKey()).update(payload).digest("hex");
}

/* Gate hanya aktif jika token akses dan kunci penandatangan tersedia (fail closed). */
export function gateConfigured() {
  return (process.env.GETKEY_ACCESS_TOKEN || "").length >= 16 && !!signingKey();
}

/* Cek token ?access= terhadap GETKEY_ACCESS_TOKEN (perbandingan constant-time). */
export function accessTokenValid(token) {
  const expected = process.env.GETKEY_ACCESS_TOKEN || "";
  if (expected.length < 16 || typeof token !== "string" || !token || token.length > 256) return false;
  return crypto.timingSafeEqual(digest(token), digest(expected));
}

/* Sesi bertanda tangan: "<expiresAt>.<nonce>.<hmac>" (stateless, tanpa database). */
export function issueSession(binding, now = Date.now()) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${now + SESSION_TTL_MS}.${nonce}.${String(binding || "")}`;
  return `${payload}.${sign(payload)}`;
}

export function sessionValid(token, binding, now = Date.now()) {
  if (!signingKey() || typeof token !== "string" || token.length > 300) return false;
  if (typeof binding !== "string" || binding.length < 32 || binding.length > 128) return false;
  const match = /^(\d{10,16})\.([0-9a-f]{32})\.([^.]*)\.([0-9a-f]{64})$/.exec(token);
  if (!match) return false;
  const [, exp, nonce, tokenBinding, sig] = match;
  if (tokenBinding !== binding) return false;
  if (Number(exp) <= now || Number(exp) > now + SESSION_TTL_MS + 60000) return false;
  return crypto.timingSafeEqual(digest(sig), digest(sign(`${exp}.${nonce}.${tokenBinding}`)));
}
