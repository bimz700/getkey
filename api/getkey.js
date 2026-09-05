import crypto from "node:crypto";
import { Redis } from "@upstash/redis";
import { db } from "./firebase.js";

const redis = Redis.fromEnv();
const COOLDOWN = 86400;
const PENDING = 30;
const KEY_ROOT = "keys";

function getIdentifier(req) {
  const raw = String(req.headers["x-device-identifier"] || "").trim();
  if (raw && raw.length >= 8 && raw.length <= 200) return raw;

  const forwarded = String(req.headers["x-forwarded-for"] || "");
  return forwarded.split(",")[0].trim() || String(req.headers["x-real-ip"] || "unknown-ip");
}

function claimId(identifier) {
  return crypto.createHash("sha256").update(identifier).digest("hex");
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Device-Identifier");
  res.setHeader("Cache-Control", "no-store");
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ success: false, message: "METHOD NOT ALLOWED" });

  try {
    const identifier = getIdentifier(req);
    const id = claimId(identifier);
    const redisKey = `mzmodz:claim:${id}`;

    const existing = await redis.get(redisKey);
    const ttl = await redis.ttl(redisKey);

    if (req.method === "GET" && req.query?.action === "check") {
      if (ttl > 0) {
        return res.status(200).json({ success: false, cooldown: true, remaining: ttl, key: existing === "PENDING" ? null : existing });
      }
      return res.status(200).json({ success: true, cooldown: false, remaining: 0 });
    }

    if (ttl > 0) {
      return res.status(200).json({
        success: false,
        cooldown: true,
        remaining: ttl,
        key: existing === "PENDING" ? null : existing,
        message: "DEVICE COOLDOWN ACTIVE"
      });
    }

    const locked = await redis.set(redisKey, "PENDING", { nx: true, ex: PENDING });
    if (!locked) {
      const currentTtl = await redis.ttl(redisKey);
      return res.status(200).json({ success: false, cooldown: true, remaining: currentTtl > 0 ? currentTtl : PENDING, key: null });
    }

    let selectedKey = null;
    const keysRef = db.ref(KEY_ROOT);
    const snapshot = await keysRef.orderByChild("status").equalTo("active").limitToFirst(50).get();
    const values = snapshot.val() || {};
    const candidates = Object.keys(values);

    if (candidates.length === 0) {
      await redis.del(redisKey);
      return res.status(200).json({ success: false, message: "ALL KEYS ARE USED" });
    }

    // Randomize the small candidate pool, then atomically claim one by transaction.
    candidates.sort(() => Math.random() - 0.5);

    for (const candidate of candidates) {
      const ref = db.ref(`${KEY_ROOT}/${candidate}`);
      const result = await ref.transaction(current => {
        if (!current || current.status !== "active") return;
        return {
          ...current,
          status: "claimed",
          claimedAt: Date.now(),
          claimedDevice: id
        };
      });

      if (result.committed) {
        selectedKey = candidate;
        break;
      }
    }

    if (!selectedKey) {
      await redis.del(redisKey);
      return res.status(200).json({ success: false, message: "NO KEY AVAILABLE" });
    }

    await redis.set(redisKey, selectedKey, { ex: COOLDOWN });

    return res.status(200).json({ success: true, key: selectedKey, remaining: COOLDOWN });
  } catch (error) {
    console.error("GETKEY ERROR", error);
    return res.status(500).json({ success: false, message: "SERVER ERROR" });
  }
}
