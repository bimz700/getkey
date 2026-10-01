import { db } from "./firebase.js";
import { requireUser } from "./auth.js";
import { rateLimit } from "./_lib/ratelimit.js";
import { fail } from "./_lib/util.js";
import { panelsOf } from "./_lib/users.js";

/*
 * GET /api/me  (Authorization: Bearer <Firebase ID token>)
 * Dipakai setelah login untuk menentukan panel: admin / seller / pilihan panel.
 * { success, uid, email, name, owner, admin, seller, panels:["admin","seller"], limits }
 */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return fail(res, "METHOD_NOT_ALLOWED");

  try {
    const limit = await rateLimit(req, "me", 60, 60000);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfter));
      return fail(res, "RATE_LIMITED");
    }

    const user = await requireUser(req);

    // Akun owner (ADMIN_EMAIL) dibuatkan record tampilan agar muncul di User Management.
    if (user.owner) {
      const ref = db.ref(`users/${user.uid}`);
      if (!(await ref.get()).exists()) {
        const now = Date.now();
        await ref.set({
          email: String(user.email).toLowerCase(),
          name: user.name || "Owner",
          active: true,
          permissions: { seller: true, admin: true, owner: true },
          protected: true,
          createdAt: now,
          updatedAt: now
        });
      }
    }

    return res.status(200).json({
      success: true,
      uid: user.uid,
      email: String(user.email || ""),
      name: user.name || "",
      owner: user.owner,
      admin: user.admin,
      seller: user.seller,
      panels: panelsOf(user),
      limits: user.limits
    });
  } catch (error) {
    const status = error.status || 500;
    if (status === 500) console.error("ME ERROR", error);
    const code = status === 401 ? "UNAUTHORIZED" : status === 403 ? "NO_ACCESS" : "SERVER_ERROR";
    return res.status(status).json({
      success: false,
      error: code,
      message: status === 403 ? "Akun ini belum memiliki akses panel." : status === 401 ? "Tidak terautentikasi." : "SERVER ERROR"
    });
  }
}
