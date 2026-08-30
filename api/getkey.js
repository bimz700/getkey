// Vercel Serverless Function - Handles Key Generation & Validation
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const keysPath = path.join(process.cwd(), 'keys.json');
    let keysData = { keys: [] };

    if (fs.existsSync(keysPath)) {
      const fileData = fs.readFileSync(keysPath, 'utf8');
      keysData = JSON.parse(fileData);
    }

    // Ambil kunci acak dari daftar yang tersedia
    if (!keysData.keys || keysData.keys.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Tidak ada lisensi key yang tersedia saat ini.'
      });
    }

    const randomIndex = Math.floor(Math.random() * keysData.keys.length);
    const selectedKey = keysData.keys[randomIndex];

    return res.status(200).json({
      success: true,
      brand: 'MZMODZ',
      key: selectedKey,
      generatedAt: new Date().toISOString(),
      expiresIn: '24 Jam'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil key, silakan coba lagi nanti.'
    });
  }
};
