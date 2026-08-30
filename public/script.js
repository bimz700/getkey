document.addEventListener('DOMContentLoaded', () => {
  const getKeyBtn = document.getElementById('getKeyBtn');
  const btnText = getKeyBtn.querySelector('.btn-text');
  const spinner = getKeyBtn.querySelector('.spinner');
  const statusMessage = document.getElementById('statusMessage');
  const countdownBox = document.getElementById('countdownBox');
  const countdownTimer = document.getElementById('countdownTimer');
  const resultBox = document.getElementById('resultBox');
  const keyInput = document.getElementById('keyInput');
  const copyBtn = document.getElementById('copyBtn');
  const toast = document.getElementById('toast');
  const statusText = document.getElementById('statusText');

  let countdownInterval = null;

  // 1. Dapatkan atau Buat Unique Device Identifier di Client
  function getDeviceId() {
    let deviceId = localStorage.getItem('mz_device_id');
    if (!deviceId) {
      deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem('mz_device_id', deviceId);
    }
    return deviceId;
  }

  // Helper untuk melakukan Fetch Request dengan Identifier
  async function fetchApi(url, options = {}) {
    const headers = {
      ...options.headers,
      'X-Device-Identifier': getDeviceId()
    };
    return fetch(url, { ...options, headers });
  }

  // 2. Format Waktu Detik ke format HH:MM:SS
  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map(v => v < 10 ? '0' + v : v).join(':');
  }

  // 3. Fungsi Memulai Live Countdown
  function startCountdown(totalSeconds) {
    clearInterval(countdownInterval);
    let remaining = totalSeconds;

    getKeyBtn.disabled = true;
    countdownBox.classList.remove('hidden');
    countdownTimer.textContent = formatTime(remaining);

    countdownInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(countdownInterval);
        resetToReadyState();
      } else {
        countdownTimer.textContent = formatTime(remaining);
      }
    }, 1000);
  }

  // 4. Reset UI ketika Cooldown Selesai
  function resetToReadyState() {
    getKeyBtn.disabled = false;
    countdownBox.classList.add('hidden');
    statusMessage.textContent = 'READY TO CLAIM NEW KEY';
    statusMessage.className = 'status-msg success';
    statusText.textContent = 'System Ready';
  }

  // 5. Cek Status Cooldown ke Server saat Page Load / Refresh
  async function checkServerStatus() {
    try {
      const response = await fetchApi('/api/getkey?action=check');
      const data = await response.json();

      if (data.cooldown && data.remaining > 0) {
        // Terapkan Kunci Server-Side
        getKeyBtn.disabled = true;
        statusMessage.textContent = 'KEY GENERATED SUCCESSFULLY';
        statusMessage.className = 'status-msg cooldown';
        statusText.textContent = 'Cooldown Active';

        if (data.key) {
          keyInput.value = data.key;
          resultBox.classList.remove('hidden');
        }

        startCountdown(data.remaining);
      } else {
        getKeyBtn.disabled = false;
      }
    } catch (error) {
      getKeyBtn.disabled = false;
    }
  }

  // Jalankan Pengecekan Server Otomatis saat Halaman Dimuat
  checkServerStatus();

  // 6. Handling Klik Tombol GET KEY
  getKeyBtn.addEventListener('click', async () => {
    // Kunci tombol & Tampilkan Loader
    getKeyBtn.disabled = true;
    btnText.classList.add('hidden');
    spinner.classList.remove('hidden');
    statusMessage.classList.add('hidden');

    try {
      const response = await fetchApi('/api/getkey', { method: 'POST' });
      const data = await response.json();

      if (data.success) {
        // PERTAMA KALI GET KEY BERHASIL
        keyInput.value = data.key;
        resultBox.classList.remove('hidden');
        
        statusMessage.textContent = 'KEY GENERATED SUCCESSFULLY';
        statusMessage.className = 'status-msg success';
        statusMessage.classList.remove('hidden');
        statusText.textContent = 'Cooldown Active';

        // PENTING: Tombol TETAP DISABLED dan langsung jalankan Cooldown 24 Jam
        getKeyBtn.disabled = true;
        startCountdown(data.remaining || 86400);

      } else if (data.cooldown) {
        // USER DALAM MASA COOLDOWN
        statusMessage.textContent = 'COOLDOWN ACTIVE';
        statusMessage.className = 'status-msg cooldown';
        statusMessage.classList.remove('hidden');
        statusText.textContent = 'Cooldown Active';

        getKeyBtn.disabled = true;
        startCountdown(data.remaining);

      } else if (data.message === 'ALL KEYS ARE USED') {
        // SEMUA KEY DIGUNAKAN
        statusMessage.textContent = 'ALL KEYS ARE USED';
        statusMessage.className = 'status-msg error';
        statusMessage.classList.remove('hidden');
        statusText.textContent = 'Keys Exhausted';

        getKeyBtn.disabled = true;

      } else {
        // ERROR SERVER LAINNYA
        statusMessage.textContent = data.message || 'SERVER ERROR';
        statusMessage.className = 'status-msg error';
        statusMessage.classList.remove('hidden');

        getKeyBtn.disabled = false; // Boleh coba lagi jika server error murni
      }
    } catch (error) {
      statusMessage.textContent = 'SERVER ERROR';
      statusMessage.className = 'status-msg error';
      statusMessage.classList.remove('hidden');

      getKeyBtn.disabled = false;
    } finally {
      btnText.classList.remove('hidden');
      spinner.classList.add('hidden');
    }
  });

  // 7. Handling Copy Key Button
  copyBtn.addEventListener('click', () => {
    if (!keyInput.value) return;

    keyInput.select();
    keyInput.setSelectionRange(0, 99999);

    try {
      document.execCommand('copy');
      showToast('Key berhasil disalin ke clipboard!');
    } catch (err) {
      showToast('Gagal menyalin key');
    }
  });

  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 3000);
  }
});
