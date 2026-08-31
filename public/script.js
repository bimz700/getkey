// ==================================================
// KONFIGURASI SHORTLINK
// ==================================================
const SHORTLINK_URL = "https://sfl.gl/cSXqDyqz";
const ENABLE_SHORTLINK = false;
const SHORTLINK_DELAY = 3000;

// ==================================================
// ELEMEN DOM
// ==================================================
const getKeyBtn = document.getElementById('getKeyBtn');
const copyKeyBtn = document.getElementById('copyKeyBtn');
const keyDisplay = document.getElementById('keyDisplay');
const statusText = document.getElementById('statusText');
const statusDot = document.getElementById('statusDot');
const countdownEl = document.getElementById('countdown');
const toastEl = document.getElementById('toast');
const btnText = getKeyBtn.querySelector('.btn-text');
const btnLoader = getKeyBtn.querySelector('.btn-loader');

let countdownInterval = null;
let currentKey = null;

// ==================================================
// UTILS: DEVICE IDENTIFIER (localStorage)
// ==================================================
function getDeviceId() {
    const STORAGE_KEY = 'mzmodz_device_id';
    let deviceId = localStorage.getItem(STORAGE_KEY);
    
    if (!deviceId) {
        // Buat ID unik secara otomatis jika belum ada
        deviceId = 'mz_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem(STORAGE_KEY, deviceId);
    }
    return deviceId;
}

// ==================================================
// UTILS: TOAST NOTIFICATION
// ==================================================
function showToast(message, duration = 3000) {
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    setTimeout(() => {
        toastEl.classList.add('hidden');
    }, duration);
}

// ==================================================
// UTILS: FORMAT COUNTDOWN (HH:MM:SS)
// ==================================================
function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

// ==================================================
// COUNTDOWN TIMER CONTROLLER
// ==================================================
function startCountdown(durationSeconds) {
    if (countdownInterval) clearInterval(countdownInterval);

    let remaining = durationSeconds;
    countdownEl.textContent = formatTime(remaining);

    countdownInterval = setInterval(() => {
        remaining--;
        
        if (remaining <= 0) {
            clearInterval(countdownInterval);
            countdownEl.textContent = "00:00:00";
            // Lakukan verifikasi ulang ke server sebelum mengaktifkan tombol
            checkStatusOnLoad();
        } else {
            countdownEl.textContent = formatTime(remaining);
        }
    }, 1000);
}

// ==================================================
// UPDATE STATUS UI
// ==================================================
function setStatus(text, type = 'ready') {
    statusText.textContent = text;
    statusDot.className = 'status-dot';
    if (type === 'cooldown') statusDot.classList.add('cooldown');
    if (type === 'error') statusDot.classList.add('error');
}

// ==================================================
// INITIAL CHECK (REFRESH / OPEN BROWSER)
// ==================================================
async function checkStatusOnLoad() {
    const deviceId = getDeviceId();

    try {
        const response = await fetch('/api/getkey?action=check', {
            method: 'GET',
            headers: {
                'X-Device-Identifier': deviceId
            }
        });

        const data = await response.json();

        if (data.cooldown) {
            // Device masih dalam masa cooldown
            currentKey = data.key;
            keyDisplay.textContent = data.key;
            copyKeyBtn.disabled = false;
            getKeyBtn.disabled = true;
            setStatus('COOLDOWN ACTIVE', 'cooldown');
            startCountdown(data.remaining);
        } else {
            // Device siap mengambil key baru
            keyDisplay.textContent = '••••••••••••••';
            copyKeyBtn.disabled = true;
            getKeyBtn.disabled = false;
            countdownEl.textContent = "24:00:00";
            setStatus('SYSTEM READY', 'ready');
        }
    } catch (error) {
        console.error('Pengecekan gagal:', error);
        setStatus('SERVER ERROR', 'error');
    }
}

// ==================================================
// ACTION: CLAIM KEY (ANTI DOUBLE CLICK)
// ==================================================
async function requestKey() {
    // 1. Langsung disable tombol & aktifkan loader untuk mencegah double-click
    getKeyBtn.disabled = true;
    btnText.textContent = 'PROCESSING...';
    btnLoader.classList.remove('hidden');
    setStatus('FETCHING KEY...', 'ready');

    const deviceId = getDeviceId();

    try {
        const response = await fetch('/api/getkey', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-Identifier': deviceId
            }
        });

        const data = await response.json();

        // Kembalikan tampilan tombol ke teks awal, tetapi tetapkan status disabled jika berhasil
        btnLoader.classList.add('hidden');
        btnText.textContent = 'GET KEY';

        if (data.success) {
            // Claim Berhasil
            currentKey = data.key;
            keyDisplay.textContent = data.key;
            copyKeyBtn.disabled = false;
            getKeyBtn.disabled = true; // Tombol tetap disabled
            setStatus('KEY CLAIMED', 'ready');
            startCountdown(data.remaining || 86400);
            showToast('KEY SUCCESSFULLY GENERATED!');

            // Eksekusi Shortlink jika diaktifkan
            if (ENABLE_SHORTLINK && SHORTLINK_URL && SHORTLINK_URL !== "ISI_SHORTLINK_DI_SINI") {
                showToast(`REDIRECTING IN ${SHORTLINK_DELAY / 1000}s...`, SHORTLINK_DELAY);
                setTimeout(() => {
                    window.location.href = SHORTLINK_URL;
                }, SHORTLINK_DELAY);
            }

        } else if (data.cooldown) {
            // Server menolak karena sedang Cooldown
            currentKey = data.key;
            keyDisplay.textContent = data.key;
            copyKeyBtn.disabled = false;
            getKeyBtn.disabled = true; // Tombol tetap disabled
            setStatus('COOLDOWN ACTIVE', 'cooldown');
            startCountdown(data.remaining);
            showToast('DEVICE ALREADY CLAIMED A KEY');

        } else if (data.message === 'ALL KEYS ARE USED') {
            // Semua key pada keys.json habis
            keyDisplay.textContent = 'OUT OF KEYS';
            copyKeyBtn.disabled = true;
            getKeyBtn.disabled = true; // Tombol disabled
            setStatus('ALL KEYS ARE USED', 'error');
            showToast('ALL KEYS ARE USED');

        } else {
            // Error lain dari server
            setStatus('SERVER ERROR', 'error');
            showToast(data.message || 'SERVER ERROR');
            // Hanya aktifkan kembali tombol jika terjadi kesalahan sistem murni
            getKeyBtn.disabled = false;
        }

    } catch (error) {
        console.error('Request gagal:', error);
        btnLoader.classList.add('hidden');
        btnText.textContent = 'GET KEY';
        setStatus('SERVER ERROR', 'error');
        showToast('FAILED TO CONNECT TO SERVER');
        getKeyBtn.disabled = false; // Bolehkan retry jika koneksi terputus
    }
}

// ==================================================
// ACTION: COPY KEY
// ==================================================
function copyKeyToClipboard() {
    if (!currentKey) return;

    // Gunakan execCommand untuk kompatibilitas lintas iFrame & mobile browser
    const tempInput = document.createElement('input');
    tempInput.value = currentKey;
    document.body.appendChild(tempInput);
    tempInput.select();
    
    try {
        document.execCommand('copy');
        showToast('KEY COPIED TO CLIPBOARD!');
    } catch (err) {
        showToast('FAILED TO COPY KEY');
    }
    
    document.body.removeChild(tempInput);
}

// ==================================================
// EVENT LISTENERS
// ==================================================
getKeyBtn.addEventListener('click', requestKey);
copyKeyBtn.addEventListener('click', copyKeyToClipboard);

// Jalankan pengecekan status awal saat halaman selesai dimuat
window.addEventListener('DOMContentLoaded', checkStatusOnLoad);
