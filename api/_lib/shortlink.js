import crypto from "node:crypto";

/*
 * ======================= SHORT LINK MANUAL (GATE GET KEY) =======================
 * Ganti URL di bawah ini jika ingin mengganti Short Link. Hanya ini yang perlu diubah.
 *
 * Tujuan akhir (destination) Short Link di dashboard penyedia short link harus:
 *     https://DOMAIN-ANDA/get-key        (polos, TANPA parameter / token)
 *
 * Alur: /get-key (belum lewat) -> server set cookie "pending" bertanda tangan -> 302 ke Short Link
 *       -> Short Link kembali ke /get-key -> server melihat cookie pending -> sesi dibuat -> GET KEY tampil.
 */
export const MANUAL_SHORT_LINK = "https://sfl.gl/BFeVm8DP";

/* Masa berlaku sesi GET KEY di memori halaman (setelah itu harus lewat Short Link lagi). */
export const SESSION_TTL_MS = 30 * 60 * 1000;

/* Batas waktu menyelesaikan Short Link setelah dikirim ke sana. */
export const PENDING_TTL_MS = 30 * 60 * 1000;

/* Waktu minimum antara redirect ke Short Link dan kembali. Kembali lebih cepat = dianggap belum menyelesaikan. */
export const MIN_SHORTLINK_MS = 8000;

const digest = value => crypto.createHash("sha256").update(String(value)).digest();

/* Kunci penandatangan diturunkan dari FIREBASE_PRIVATE_KEY (hanya ada di server). */
function signingKey() {
  const base = process.env.FIREBASE_PRIVATE_KEY || "";
  return base ? crypto.createHmac("sha256", base).update("mzmodz-getkey-gate-v1").digest() : null;
}

function sign(payload) {
  return crypto.createHmac("sha256", signingKey()).update(payload).digest("hex");
}

/* Gate aktif jika kunci penandatangan tersedia (fail closed). GETKEY_ACCESS_TOKEN tidak lagi dipakai. */
export function gateConfigured() {
  return !!signingKey();
}

/* Sesi bertanda tangan: "<expiresAt>.<nonce>.<hmac>" (stateless, tanpa database). */
export function issueSession(now = Date.now()) {
  const payload = `${now + SESSION_TTL_MS}.${crypto.randomBytes(8).toString("hex")}`;
  return `${payload}.${sign(payload)}`;
}

export function sessionValid(token, now = Date.now()) {
  if (!signingKey() || typeof token !== "string" || token.length > 200) return false;
  const match = /^(\d{10,16})\.([0-9a-f]{16})\.([0-9a-f]{64})$/.exec(token);
  if (!match) return false;
  const [, exp, nonce, sig] = match;
  if (Number(exp) <= now || Number(exp) > now + SESSION_TTL_MS + 60000) return false;
  return crypto.timingSafeEqual(digest(sig), digest(sign(`${exp}.${nonce}`)));
}

/* Cookie "pending": "<issuedAt>.<nonce>.<hmac>" - bukti server pernah mengirim browser ini ke Short Link. */
export function issuePending(now = Date.now()) {
  const payload = `${now}.${crypto.randomBytes(8).toString("hex")}`;
  return `${payload}.${sign(`pending.${payload}`)}`;
}

/* Hasil: "none" | "invalid" | "expired" | "early" | "ok" */
export function pendingState(token, now = Date.now()) {
  if (!token) return "none";
  const match = /^(\d{10,16})\.([0-9a-f]{16})\.([0-9a-f]{64})$/.exec(String(token));
  if (!match || !signingKey()) return "invalid";
  const [, issued, nonce, sig] = match;
  if (!crypto.timingSafeEqual(digest(sig), digest(sign(`pending.${issued}.${nonce}`)))) return "invalid";
  const age = now - Number(issued);
  if (age < 0 || age > PENDING_TTL_MS) return "expired";
  return age < MIN_SHORTLINK_MS ? "early" : "ok";
}

/* Opsional (GETKEY_REQUIRE_REFERER=1): Referer harus dari host Short Link. Hanya lapisan tambahan, bukan satu-satunya. */
export function refererOk(referer) {
  if (process.env.GETKEY_REQUIRE_REFERER !== "1") return true;
  try {
    const want = new URL(MANUAL_SHORT_LINK).hostname;
    const got = new URL(String(referer || "")).hostname;
    return got === want || got.endsWith(`.${want}`);
  } catch { return false; }
}
