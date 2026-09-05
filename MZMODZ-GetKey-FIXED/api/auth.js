import { adminAuth } from "./firebase.js";

export async function requireAdmin(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    const error = new Error("UNAUTHORIZED");
    error.status = 401;
    throw error;
  }

  const token = header.slice(7).trim();
  const decoded = await adminAuth.verifyIdToken(token);
  const allowedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  if (!allowedEmail || decoded.email?.trim().toLowerCase() !== allowedEmail) {
    const error = new Error("FORBIDDEN");
    error.status = 403;
    throw error;
  }

  return decoded;
}
