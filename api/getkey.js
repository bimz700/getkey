import { Redis } from '@upstash/redis';
import fs from 'fs';
import path from 'path';

// Inisialisasi Upstash Redis dari Environment Variables
const redis = Redis.fromEnv();

export default async function handler(req, res) {
  // Header CORS untuk HTTP Methods
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Device-Identifier'
  );

  // Tangani preflight request (OPTIONS)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 1. Ekstraksi Device ID dari Header (Fallback ke IP jika header kosong)
    const deviceHeader = req.headers['x-device-identifier'];
    const rawIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const clientIp = Array.isArray(rawIp) ? rawIp[0] : rawIp.split(',')[0].trim();
    
    const deviceId = (deviceHeader && deviceHeader.trim().length > 0)
      ? deviceHeader.trim()
      : `ip_${clientIp.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    const claimKey = `claim:${deviceId}`;
    const usedKeysSetKey = 'used_keys_set';

    // 2. Baca daftar key dari keys.json secara synchronous
    const keysFilePath = path.join(process.cwd(), 'keys.json');
    if (!fs.existsSync(keysFilePath)) {
      console.error('File keys.json tidak ditemukan.');
      return res.status(500).json({ success: false, message: 'SERVER ERROR' });
    }

    const keysFileContent = fs.readFileSync(keysFilePath, 'utf8');
    const allKeys = JSON.parse(keysFileContent);

    if (!Array.isArray(allKeys) || allKeys.length === 0) {
      return res.status(500).json({ success: false, message: 'SERVER ERROR' });
    }

    // 3. Cek apakah device sedang dalam cooldown 24 jam
    const existingKey = await redis.get(claimKey);
    if (existingKey) {
      const ttl = await redis.ttl(claimKey);
      const remainingSeconds = ttl > 0 ? ttl : 0;

      return res.status(200).json({
        success: false,
        cooldown: true,
        remaining: remainingSeconds,
        key: existingKey
      });
    }

    // Cek action parameter untuk pengecekan status awal dari frontend
    const action = req.query?.action || req.body?.action;
    if (action === 'check') {
      return res.status(200).json({
        success: true,
        cooldown: false,
        remaining: 0
      });
    }

    // 4. Proses pengambilan key baru secara random & atomic
    const usedKeys = await redis.smembers(usedKeysSetKey);
    const usedSet = new Set(usedKeys || []);
    const availableKeys = allKeys.filter(k => !usedSet.has(k));

    // Jika seluruh key pada keys.json sudah terpakai
    if (availableKeys.length === 0) {
      return res.status(200).json({
        success: false,
        message: 'ALL KEYS ARE USED'
      });
    }

    // Acak daftar key yang tersedia (Randomization)
    const shuffledKeys = [...availableKeys].sort(() => Math.random() - 0.5);

    let selectedKey = null;

    // Gunakan Redis SADD untuk melakukan reservasi atomic
    for (const candidate of shuffledKeys) {
      const isReserved = await redis.sadd(usedKeysSetKey, candidate);
      if (isReserved === 1) {
        selectedKey = candidate;
        break;
      }
    }

    // Jika terjadi race condition dan tidak ada key yang bisa di-reserve
    if (!selectedKey) {
      return res.status(200).json({
        success: false,
        message: 'ALL KEYS ARE USED'
      });
    }

    // 5. Simpan data claim device ke Redis dengan TTL 86400 detik (24 Jam)
    const claimResult = await redis.set(claimKey, selectedKey, {
      nx: true,
      ex: 86400
    });

    // Handle situasi jika claim gagal karena request ganda bersamaan (Rollback)
    if (!claimResult) {
      await redis.srem(usedKeysSetKey, selectedKey);
      const activeClaimKey = await redis.get(claimKey);
      const ttl = await redis.ttl(claimKey);

      return res.status(200).json({
        success: false,
        cooldown: true,
        remaining: ttl > 0 ? ttl : 86400,
        key: activeClaimKey || selectedKey
      });
    }

    // 6. Pengambilan key berhasil
    return res.status(200).json({
      success: true,
      key: selectedKey,
      remaining: 86400
    });

  } catch (error) {
    console.error('Database/Server Error:', error);
    return res.status(500).json({
      success: false,
      message: 'SERVER ERROR'
    });
  }
}
