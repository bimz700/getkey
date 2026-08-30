const { Redis } = require('@upstash/redis');
const fs = require('fs');
const path = require('path');

// Inisialisasi Upstash Redis Client dari Environment Variables
const redis = Redis.fromEnv();

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Device-Identifier');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 1. Ekstrak Identifier (Client Device ID dari Header atau Fallback IP)
    const clientDeviceId = req.headers['x-device-identifier'];
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-ip';
    
    // Gunakan Device ID jika ada, jika tidak gunakan IP
    const identifier = clientDeviceId ? clientDeviceId.trim() : clientIp.split(',')[0].trim();
    const claimKey = `claim:${identifier}`;

    // 2. Opsi Pengecekan Status Cooldown (digunakan saat Load/Refresh Halaman)
    if (req.query.action === 'check') {
      const ttl = await redis.ttl(claimKey);
      if (ttl > 0) {
        const savedKey = await redis.get(claimKey);
        return res.status(200).json({
          success: false,
          cooldown: true,
          remaining: ttl,
          key: typeof savedKey === 'string' ? savedKey : null
        });
      }
      return res.status(200).json({
        success: true,
        cooldown: false,
        remaining: 0
      });
    }

    // 3. Cek apakah user sedang dalam masa Cooldown sebelum memproses
    const currentTtl = await redis.ttl(claimKey);
    if (currentTtl > 0) {
      return res.status(200).json({
        success: false,
        cooldown: true,
        remaining: currentTtl
      });
    }

    // 4. Membaca daftar key dari keys.json (ROOT directory)
    const keysPath = path.join(process.cwd(), 'keys.json');
    if (!fs.existsSync(keysPath)) {
      return res.status(500).json({
        success: false,
        message: "SERVER ERROR"
      });
    }

    const rawKeys = fs.readFileSync(keysPath, 'utf8');
    const availableKeys = JSON.parse(rawKeys);

    if (!Array.isArray(availableKeys) || availableKeys.length === 0) {
      return res.status(200).json({
        success: false,
        message: "ALL KEYS ARE USED"
      });
    }

    // 5. Cari Key yang Belum Digunakan di Redis (digunakan secara Atomic via SADD)
    let selectedKey = null;

    for (const candidateKey of availableKeys) {
      // SADD mengembalikan 1 jika elemen baru ditambahkan, 0 jika sudah ada di set
      const isNewKey = await redis.sadd('used_keys_set', candidateKey);
      if (isNewKey === 1) {
        selectedKey = candidateKey;
        break; // Dapatkan key yang valid dan keluar dari loop
      }
    }

    // Jika seluruh key di keys.json sudah ada di used_keys_set
    if (!selectedKey) {
      return res.status(200).json({
        success: false,
        message: "ALL KEYS ARE USED"
      });
    }

    // 6. Kunci User/Device dengan Redis SET NX EX 86400 (Atomic Claim & Anti-Race Condition)
    // Menyimpan key yang didapat di value claim untuk konsistensi UI jika di-refresh
    const acquired = await redis.set(claimKey, selectedKey, {
      nx: true,
      ex: 86400 // TTL 24 jam (86400 detik)
    });

    // Jika SET NX gagal (karena ada request bersamaan dari device yang sama)
    if (!acquired) {
      // Kembalikan key ke daftar yang belum dipakai agar tidak terbuang
      await redis.srem('used_keys_set', selectedKey);
      
      const remainingTtl = await redis.ttl(claimKey);
      return res.status(200).json({
        success: false,
        cooldown: true,
        remaining: remainingTtl > 0 ? remainingTtl : 86400
      });
    }

    // 7. Berhasil Mendapatkan Key & Menerapkan Cooldown 24 Jam
    return res.status(200).json({
      success: true,
      key: selectedKey,
      remaining: 86400
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "SERVER ERROR"
    });
  }
};
