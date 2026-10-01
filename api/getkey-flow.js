import crypto from "node:crypto";
import { db } from "./firebase.js";
import { cors, fail } from "./_lib/util.js";
import { rateLimit } from "./_lib/ratelimit.js";

function token() { return crypto.randomBytes(9).toString("base64url"); }
function label(ms) {
  const minutes = Math.max(1, Math.round(Number(ms || 0) / 60000));
  if (minutes % 1440 === 0) return `${minutes / 1440} hari`;
  if (minutes % 60 === 0) return `${minutes / 60} jam`;
  return `${minutes} menit`;
}
function cleanMode(v) { return String(v || "").toLowerCase() === "double" ? "double" : "single"; }
function publicOption(config, mode) {
  const c = config?.[mode];
  if (!c?.enabled) return null;
  const durationMs = Number(c.durationMs || 0);
  return { enabled: true, durationMs, durationLabel: label(durationMs), finalDestination: String(c.finalDestination || "/get-key?final=1") };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return fail(res, "METHOD_NOT_ALLOWED");
  try {
    const limit = await rateLimit(req, "getkey-flow", 20, 60000);
    if (!limit.allowed) { res.setHeader("Retry-After", String(limit.retryAfter)); return fail(res, "RATE_LIMITED"); }
    const system = (await db.ref("system/getKeyFlow").get()).val() || {};
    const options = { single: publicOption(system, "single"), double: publicOption(system, "double") };
    const mode = req.query?.mode ? cleanMode(req.query.mode) : "";
    if (!mode) return res.status(200).json({ success: true, enabled: Boolean(options.single || options.double), options });
    const cfg = options[mode];
    if (!cfg) return res.status(404).json({ success: false, error: "FLOW_DISABLED", message: "Opsi Get Key ini sedang tidak tersedia." });
    const now = Date.now();
    const flowId = `public-${Date.now().toString(36)}-${crypto.randomBytes(5).toString("hex")}`;
    const expiresAt = now + cfg.durationMs;
    if (mode === "single") {
      let t = token();
      let unique = false;
      for (let i = 0; i < 8; i++) {
        if (!(await db.ref(`getKeyLinks/${t}`).get()).exists()) { unique = true; break; }
        t = token();
      }
      if (!unique) return fail(res, "SERVER_ERROR");
      await db.ref(`getKeyLinks/${t}`).set({ token: t, destination: cfg.finalDestination, durationMs: cfg.durationMs, expiresAt, usedAt: 0, createdAt: now, updatedAt: now, createdBy: "public-flow", flowId, step: 1, totalSteps: 1 });
      return res.status(200).json({ success: true, mode, url: `/s/${t}` });
    }
    let step2 = token();
    let step1 = token();
    let unique = false;
    for (let i = 0; i < 8; i++) {
      const [a, b] = await Promise.all([db.ref(`getKeyLinks/${step1}`).get(), db.ref(`getKeyLinks/${step2}`).get()]);
      if (!a.exists() && !b.exists()) { unique = true; break; }
      step1 = token(); step2 = token();
    }
    if (!unique) return fail(res, "SERVER_ERROR");
    await db.ref(`getKeyLinks/${step2}`).set({ token: step2, destination: cfg.finalDestination, durationMs: cfg.durationMs, expiresAt, usedAt: 0, createdAt: now, updatedAt: now, createdBy: "public-flow", flowId, step: 2, totalSteps: 2 });
    await db.ref(`getKeyLinks/${step1}`).set({ token: step1, destination: `/s/${step2}`, durationMs: cfg.durationMs, expiresAt, usedAt: 0, createdAt: now, updatedAt: now, createdBy: "public-flow", flowId, step: 1, totalSteps: 2 });
    return res.status(200).json({ success: true, mode, url: `/s/${step1}` });
  } catch (error) {
    console.error("GETKEY FLOW ERROR", error);
    return fail(res, "SERVER_ERROR");
  }
}
