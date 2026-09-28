import { db } from "../firebase.js";
import { getIp, sha256 } from "./util.js";

/*
 * Fixed-window rate limit per IP, disimpan di RTDB (/rateLimits) memakai
 * transaction supaya konsisten antar instance serverless.
 * Jika penyimpanan error, request diizinkan (fail-open) dan error dicatat.
 */
export async function rateLimit(req, scope, limit, windowMs) {
  try {
    const id = sha256(getIp(req)).slice(0, 32);
    const ref = db.ref(`rateLimits/${scope}/${id}`);
    const now = Date.now();
    let blocked = false;
    let windowStart = now;

    await ref.transaction(current => {
      blocked = false;
      if (!current || typeof current !== "object" || now - Number(current.s || 0) >= windowMs) {
        windowStart = now;
        return { s: now, c: 1 };
      }
      windowStart = Number(current.s);
      if (Number(current.c || 0) >= limit) {
        blocked = true;
        return; // abort: tidak menulis apa pun saat sudah diblokir
      }
      return { s: current.s, c: Number(current.c || 0) + 1 };
    });

    return {
      allowed: !blocked,
      retryAfter: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000))
    };
  } catch (error) {
    console.error("RATE LIMIT ERROR", error);
    return { allowed: true, retryAfter: 0 };
  }
}
