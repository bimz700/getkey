import { Redis } from "@upstash/redis";
import fs from "fs";
import path from "path";

const redis = Redis.fromEnv();
const keysPath = path.join(process.cwd(), "api-private", "keys.json");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Device-Identifier");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ success: false, message: "METHOD NOT ALLOWED" });
  }

  try {
    const deviceHeader = req.headers["x-device-identifier"];
    const forwarded = req.headers["x-forwarded-for"];
    const ip = forwarded
      ? forwarded.split(",")[0].trim()
      : (req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown-ip");

    const identifier = deviceHeader?.trim() || ip;
    const claimKey = `claim:${identifier}`;

    const ttl = await redis.ttl(claimKey);

    if (req.query?.action === "check") {
      if (ttl > 0) {
        const savedKey = await redis.get(claimKey);
        return res.status(200).json({
          success: false,
          cooldown: true,
          remaining: ttl,
          key: savedKey || null
        });
      }
      return res.status(200).json({ success: true, cooldown: false, remaining: 0 });
    }

    if (ttl > 0) {
      const savedKey = await redis.get(claimKey);
      return res.status(200).json({
        success: false,
        cooldown: true,
        remaining: ttl,
        key: savedKey || null
      });
    }

    if (!fs.existsSync(keysPath)) {
      console.error("keys.json not found:", keysPath);
      return res.status(500).json({ success: false, message: "KEY DATABASE NOT FOUND" });
    }

    let keys;
    try {
      keys = JSON.parse(fs.readFileSync(keysPath, "utf8"));
    } catch (e) {
      console.error("Invalid keys.json:", e);
      return res.status(500).json({ success: false, message: "INVALID KEY DATABASE" });
    }

    if (!Array.isArray(keys) || keys.length === 0) {
      return res.status(200).json({ success: false, message: "ALL KEYS ARE USED" });
    }

    const shuffled = [...keys].filter(k => typeof k === "string" && k.trim()).sort(() => Math.random() - 0.5);
    let selectedKey = null;

    for (const candidate of shuffled) {
      const added = await redis.sadd("used_keys_set", candidate);
      if (added === 1) {
        selectedKey = candidate;
        break;
      }
    }

    if (!selectedKey) {
      return res.status(200).json({ success: false, message: "ALL KEYS ARE USED" });
    }

    const acquired = await redis.set(claimKey, selectedKey, { nx: true, ex: 86400 });

    if (!acquired) {
      await redis.srem("used_keys_set", selectedKey);
      const remaining = await redis.ttl(claimKey);
      return res.status(200).json({
        success: false,
        cooldown: true,
        remaining: remaining > 0 ? remaining : 86400
      });
    }

    return res.status(200).json({
      success: true,
      key: selectedKey,
      remaining: 86400
    });
  } catch (error) {
    console.error("GETKEY FUNCTION ERROR:", error);
    return res.status(500).json({ success: false, message: "SERVER ERROR" });
  }
}
