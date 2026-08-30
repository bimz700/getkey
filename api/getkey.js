import { Redis } from '@upstash/redis';
import keys from '../keys.json' assert { type: 'json' };

// Inisialisasi Upstash Redis menggunakan Environment Variables
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  // Hanya izinkan method GET atau POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    // 1. Deteksi IP pengguna dari header Vercel
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded
      ? forwarded.split(',')[0].trim()
      : req.headers['x-real-ip'] || req.socket?.remoteAddress || '127.0.0.1';

    const claimKey = `claim:${ip}`;

    // 2. Cek apakah IP sudah pernah melakukan claim dan masih dalam cooldown
    const existingClaim = await redis.get(claimKey);
    const ttl = await redis.ttl(claimKey);

    if (existingClaim && ttl > 0) {
      return res.status(200).json({
        success: false,
        cooldown: true,
        remaining: ttl,
      });
    }

    // 3. Ambil daftar key yang sudah terpakai di Redis
    const usedKeys = await redis.smembers('used_keys_set');
    const usedKeysSet = new Set(usedKeys || []);

    // Filter key dari keys.json yang belum dipakai
    const availableKeys = keys.filter((k) => !usedKeysSet.has(k));

    // 4. Jika semua key sudah digunakan
    if (availableKeys.length === 0) {
      return res.status(200).json({
        success: false,
        message: 'ALL KEYS ARE USED',
      });
    }

    // 5. Pilih key secara acak dan gunakan operasi atomic SADD untuk mencegah race condition
    let selectedKey = null;
    const shuffledKeys = [...availableKeys].sort(() => Math.random() - 0.5);

    for (const keyCandidate of shuffledKeys) {
      // SADD mengembalikan 1 jika elemen baru berhasil ditambahkan, atau 0 jika sudah ada
      const added = await redis.sadd('used_keys_set', keyCandidate);
      if (added === 1) {
        selectedKey = keyCandidate;
        break;
      }
    }

    // Jika terjadi bentrokan sangat tinggi dan tidak berhasil mengklaim key candidate
    if (!selectedKey) {
      return res.status(200).json({
        success: false,
        message: 'ALL KEYS ARE USED',
      });
    }

    // 6. Simpan claim berdasarkan IP dengan TTL 86400 detik (24 Jam)
    await redis.set(
      claimKey,
      JSON.stringify({
        key: selectedKey,
        claimedAt: Date.now(),
      }),
      { ex: 86400 }
    );

    // 7. Berikan response sukses ke frontend
    return res.status(200).json({
      success: true,
      key: selectedKey,
      remaining: 0,
    });
  } catch (error) {
    console.error('Redis API Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error / Storage Service Unavailable',
    });
  }
}