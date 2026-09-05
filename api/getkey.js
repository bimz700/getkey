import crypto from "node:crypto";
import { Redis } from "@upstash/redis";
import { db } from "./firebase.js";

const redis = Redis.fromEnv();
const COOLDOWN = 86400;
const PENDING = 30;
const KEY_ROOT = "keys";

function getDeviceIdentifier(req) {
  const raw = String(req.headers["x-device-identifier"] || "").trim();
  if (raw && raw.length >= 8 && raw.length <= 200) return raw;
  return "unknown-device";
}
function getIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "");
  return forwarded.split(",")[0].trim() || String(req.headers["x-real-ip"] || "unknown-ip");
}
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Device-Identifier");
  res.setHeader("Cache-Control", "no-store");
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ success:false, message:"METHOD NOT ALLOWED" });

  const deviceIdentifier = getDeviceIdentifier(req);
  const deviceId = sha256(deviceIdentifier);
  const ip = getIp(req);
  const redisKey = `mzmodz:claim:${deviceId}`;

  try {
    const existing = await redis.get(redisKey);
    const ttl = await redis.ttl(redisKey);

    if (req.method === "GET" && req.query?.action === "check") {
      return res.status(200).json(ttl > 0
        ? { success:false, cooldown:true, remaining:ttl, key:existing === "PENDING" ? null : existing }
        : { success:true, cooldown:false, remaining:0 });
    }
    if (ttl > 0) return res.status(200).json({ success:false, cooldown:true, remaining:ttl, key:existing === "PENDING" ? null : existing, message:"DEVICE COOLDOWN ACTIVE" });

    const locked = await redis.set(redisKey, "PENDING", { nx:true, ex:PENDING });
    if (!locked) return res.status(200).json({ success:false, cooldown:true, remaining:PENDING, key:null });

    const snapshot = await db.ref(KEY_ROOT).orderByChild("status").equalTo("active").limitToLast(500).get();
    const values = snapshot.val() || {};
    const candidates = Object.keys(values).sort((a,b) => Number(values[a]?.createdAt||0) - Number(values[b]?.createdAt||0));
    const now = Date.now();
    let selectedKey = null;

    for (const key of candidates) {
      const ref = db.ref(`${KEY_ROOT}/${key}`);
      const result = await ref.transaction(current => {
        if (!current || current.status !== "active") return;
        const claims = current.claims && typeof current.claims === "object" ? current.claims : {};
        if (Object.prototype.hasOwnProperty.call(claims, deviceId)) return current;
        const maxDevices = Number(current.maxDevices || 0);
        if (maxDevices > 0 && Object.keys(claims).length >= maxDevices) return;
        return {
          ...current,
          claims: { ...claims, [deviceId]: { ip, claimedAt: now, device: deviceId } },
          lastClaimAt: now
        };
      });
      if (result.committed) { selectedKey = key; break; }
    }

    if (!selectedKey) {
      await redis.del(redisKey);
      return res.status(200).json({ success:false, message:"NO KEY AVAILABLE" });
    }

    await redis.set(redisKey, selectedKey, { ex:COOLDOWN });
    return res.status(200).json({ success:true, key:selectedKey, remaining:COOLDOWN });
  } catch (error) {
    console.error("GETKEY ERROR", error);
    try { await redis.del(redisKey); } catch {}
    return res.status(500).json({ success:false, message:"SERVER ERROR" });
  }
}
