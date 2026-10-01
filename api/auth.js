import { adminAuth } from "./firebase.js";
import { resolvePrincipal } from "./_lib/users.js";

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function verifyToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) throw httpError(401, "UNAUTHORIZED");
  try {
    return await adminAuth.verifyIdToken(header.slice(7).trim());
  } catch {
    throw httpError(401, "UNAUTHORIZED");
  }
}

/* Token valid + punya akses (owner / admin / seller). Melempar 403 NO_ACCESS jika tidak. */
export async function requireUser(req) {
  const decoded = await verifyToken(req);
  const principal = await resolvePrincipal(decoded);
  if (!principal) throw httpError(403, "NO_ACCESS");
  return { ...decoded, ...principal, email: decoded.email || principal.email };
}

/*
 * Nama & kontrak existing dipertahankan: dipakai /api/admin. Sekarang lolos untuk
 * owner (ADMIN_EMAIL, seperti sebelumnya) dan akun dengan permission admin.
 */
export async function requireAdmin(req) {
  const user = await requireUser(req).catch(error => {
    throw error.message === "NO_ACCESS" ? httpError(403, "FORBIDDEN") : error;
  });
  if (!user.admin) throw httpError(403, "FORBIDDEN");
  return user;
}

export async function requireSeller(req) {
  const user = await requireUser(req).catch(error => {
    throw error.message === "NO_ACCESS" ? httpError(403, "FORBIDDEN") : error;
  });
  if (!user.seller) throw httpError(403, "FORBIDDEN");
  return user;
}

export function assertOwner(user) {
  if (!user?.owner) throw httpError(403, "FORBIDDEN");
}
