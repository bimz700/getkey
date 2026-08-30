import { Redis } from '@upstash/redis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const redis = Redis.fromEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Device-Identifier'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'METHOD NOT ALLOWED'
    });
  }

  try {
    // ==============================
    // IDENTIFIER
    // ==============================

    const deviceHeader = req.headers['x-device-identifier'];

    const forwardedFor = req.headers['x-forwarded-for'];

    const clientIp = forwardedFor
      ? forwardedFor.split(',')[0].trim()
      : req.headers['x-real-ip'] ||
        req.socket?.remoteAddress ||
        'unknown-ip';

    const identifier = deviceHeader?.trim()
      ? deviceHeader.trim()
      : clientIp;

    const claimKey = `claim:${identifier}`;

    // ==============================
    // CHECK COOLDOWN
    // ==============================

    const currentTtl = await redis.ttl(claimKey);

    if (currentTtl > 0) {
      const savedKey = await redis.get(claimKey);

      return res.status(200).json({
        success: false,
        cooldown: true,
        remaining: currentTtl,
        key: savedKey || null
      });
    }

    // ==============================
    // READ KEYS
    // ==============================

    const keysPath = path.join(process.cwd(), 'keys.json');

    if (!fs.existsSync(keysPath)) {
      console.error('keys.json tidak ditemukan');

      return res.status(500).json({
        success: false,
        message: 'SERVER ERROR'
      });
    }

    const rawKeys = fs.readFileSync(keysPath, 'utf8');

    let keys;

    try {
      keys = JSON.parse(rawKeys);
    } catch (error) {
      console.error('keys.json tidak valid:', error);

      return res.status(500).json({
        success: false,
        message: 'SERVER ERROR'
      });
    }

    if (!Array.isArray(keys) || keys.length === 0) {
      return res.status(200).json({
        success: false,
        message: 'ALL KEYS ARE USED'
      });
    }

    // ==============================
    // RANDOMIZE KEY
    // ==============================

    const shuffledKeys = [...keys].sort(
      () => Math.random() - 0.5
    );

    let selectedKey = null;

    // ==============================
    // RESERVE KEY
    // ==============================

    for (const candidateKey of shuffledKeys) {
      const added = await redis.sadd(
        'used_keys_set',
        candidateKey
      );

      if (added === 1) {
        selectedKey = candidateKey;
        break;
      }
    }

    if (!selectedKey) {
      return res.status(200).json({
        success: false,
        message: 'ALL KEYS ARE USED'
      });
    }

    // ==============================
    // CREATE 24H CLAIM
    // ==============================

    const acquired = await redis.set(
      claimKey,
      selectedKey,
      {
        nx: true,
        ex: 86400
      }
    );

    // ==============================
    // CLAIM FAILED
    // ==============================

    if (!acquired) {
      await redis.srem(
        'used_keys_set',
        selectedKey
      );

      const remainingTtl = await redis.ttl(
        claimKey
      );

      return res.status(200).json({
        success: false,
        cooldown: true,
        remaining:
          remainingTtl > 0
            ? remainingTtl
            : 86400
      });
    }

    // ==============================
    // SUCCESS
    // ==============================

    return res.status(200).json({
      success: true,
      key: selectedKey,
      remaining: 86400
    });

  } catch (error) {
    console.error('GETKEY ERROR:', error);

    return res.status(500).json({
      success: false,
      message: 'SERVER ERROR'
    });
  }
}
