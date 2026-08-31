// ==================================================
// KONFIGURASI SHORTLINK
// ==================================================
const SHORTLINK_URL = "https://sfl.gl/cSXqDyqz";

// true = redirect ke ShortLink saat halaman dibuka
// kembali dalam kondisi cooldown.
// false = tetap tampilkan halaman cooldown.
const ENABLE_SHORTLINK = true;

const SHORTLINK_DELAY = 500;

// ==================================================
// KONFIGURASI
// ==================================================
const API_URL = "/api/getkey";
const STORAGE_KEY = "mzmodz_device_id";

// ==================================================
// ELEMEN DOM
// ==================================================
const getKeyBtn = document.getElementById("getKeyBtn");
const copyKeyBtn = document.getElementById("copyKeyBtn");
const keyDisplay = document.getElementById("keyDisplay");
const statusText = document.getElementById("statusText");
const statusDot = document.getElementById("statusDot");
const countdownEl = document.getElementById("countdown");
const toastEl = document.getElementById("toast");

const btnText = getKeyBtn
    ? getKeyBtn.querySelector(".btn-text")
    : null;

const btnLoader = getKeyBtn
    ? getKeyBtn.querySelector(".btn-loader")
    : null;

let countdownInterval = null;
let currentKey = null;
let isRequesting = false;
let hasSuccessfullyClaimed = false;

// ==================================================
// DEVICE ID
// ==================================================
function getDeviceId() {
    let deviceId = localStorage.getItem(STORAGE_KEY);

    if (!deviceId) {
        deviceId =
            "mz_" +
            crypto.randomUUID();

        localStorage.setItem(STORAGE_KEY, deviceId);
    }

    return deviceId;
}

// ==================================================
// TOAST
// ==================================================
function showToast(message, duration = 3000) {
    if (!toastEl) return;

    toastEl.textContent = message;
    toastEl.classList.remove("hidden");

    setTimeout(() => {
        toastEl.classList.add("hidden");
    }, duration);
}

// ==================================================
// FORMAT TIME
// ==================================================
function formatTime(seconds) {
    seconds = Math.max(0, Number(seconds) || 0);

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const pad = (num) =>
        String(num).padStart(2, "0");

    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

// ==================================================
// STATUS UI
// ==================================================
function setStatus(text, type = "ready") {
    if (statusText) {
        statusText.textContent = text;
    }

    if (statusDot) {
        statusDot.className = "status-dot";

        if (type === "cooldown") {
            statusDot.classList.add("cooldown");
        }

        if (type === "error") {
            statusDot.classList.add("error");
        }
    }
}

// ==================================================
// BUTTON LOADING
// ==================================================
function setLoading(loading) {
    if (!getKeyBtn) return;

    if (loading) {
        getKeyBtn.disabled = true;

        if (btnText) {
            btnText.classList.add("hidden");
        }

        if (btnLoader) {
            btnLoader.classList.remove("hidden");
        }
    } else {
        if (btnText) {
            btnText.classList.remove("hidden");
        }

        if (btnLoader) {
            btnLoader.classList.add("hidden");
        }
    }
}

// ==================================================
// COUNTDOWN
// ==================================================
function startCountdown(durationSeconds) {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    let remaining = Number(durationSeconds) || 0;

    if (countdownEl) {
        countdownEl.classList.remove("hidden");
        countdownEl.textContent = formatTime(remaining);
    }

    if (remaining <= 0) {
        checkStatusOnLoad();
        return;
    }

    countdownInterval = setInterval(() => {
        remaining--;

        if (countdownEl) {
            countdownEl.textContent =
                formatTime(remaining);
        }

        if (remaining <= 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;

            if (countdownEl) {
                countdownEl.textContent = "00:00:00";
            }

            // Jangan langsung menganggap cooldown selesai.
            // Verifikasi kembali ke Redis.
            checkStatusOnLoad();
        }
    }, 1000);
}

// ==================================================
// STOP COUNTDOWN
// ==================================================
function stopCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }

    if (countdownEl) {
        countdownEl.classList.add("hidden");
    }
}

// ==================================================
// REDIRECT SHORTLINK
// ==================================================
function redirectToShortlink() {
    if (!ENABLE_SHORTLINK) {
        return;
    }

    setTimeout(() => {
        window.location.href = SHORTLINK_URL;
    }, SHORTLINK_DELAY);
}

// ==================================================
// CHECK STATUS SAAT LOAD / REFRESH
// ==================================================
async function checkStatusOnLoad() {
    const deviceId = getDeviceId();

    try {
        const response = await fetch(
            `${API_URL}?action=check`,
            {
                method: "GET",
                headers: {
                    "X-Device-Identifier": deviceId
                },
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const data = await response.json();

        // ==============================================
        // MASIH COOLDOWN
        // ==============================================
        if (data.cooldown === true) {
            currentKey = data.key || null;

            if (currentKey && keyDisplay) {
                keyDisplay.textContent =
                    currentKey;
            }

            if (copyKeyBtn && currentKey) {
                copyKeyBtn.disabled = false;
            }

            setStatus(
                "24 HOUR COOLDOWN",
                "cooldown"
            );

            startCountdown(data.remaining);

            if (getKeyBtn) {
                getKeyBtn.disabled = true;
            }

            /*
             * Jika user membuka kembali / refresh halaman
             * ketika masih cooldown, redirect ke ShortLink.
             *
             * Claim Redis TIDAK berubah.
             */
            redirectToShortlink();

            return;
        }

        // ==============================================
        // TIDAK COOLDOWN
        // ==============================================
        stopCountdown();

        if (!hasSuccessfullyClaimed) {
            if (keyDisplay) {
                keyDisplay.textContent =
                    "••••••••••••••";
            }

            currentKey = null;

            if (copyKeyBtn) {
                copyKeyBtn.disabled = true;
            }
        }

        setStatus("SYSTEM READY", "ready");

        if (getKeyBtn && !isRequesting) {
            getKeyBtn.disabled = false;
        }

    } catch (error) {
        console.error(
            "Status check error:",
            error
        );

        setStatus(
            "SERVER ERROR",
            "error"
        );
    }
}

// ==================================================
// GET KEY
// ==================================================
if (getKeyBtn) {
    getKeyBtn.addEventListener(
        "click",
        async () => {

            // Anti double click
            if (isRequesting) {
                return;
            }

            // Kalau sudah berhasil claim,
            // jangan izinkan request kedua.
            if (hasSuccessfullyClaimed) {
                return;
            }

            isRequesting = true;

            getKeyBtn.disabled = true;

            setLoading(true);

            setStatus(
                "GENERATING KEY...",
                "ready"
            );

            try {
                const deviceId = getDeviceId();

                const response = await fetch(
                    API_URL,
                    {
                        method: "GET",
                        headers: {
                            "X-Device-Identifier":
                                deviceId
                        },
                        cache: "no-store"
                    }
                );

                if (!response.ok) {
                    throw new Error(
                        `HTTP ${response.status}`
                    );
                }

                const data =
                    await response.json();

                // ==========================================
                // SUCCESS
                // ==========================================
                if (data.success === true) {

                    currentKey = data.key;
                    hasSuccessfullyClaimed = true;

                    if (keyDisplay) {
                        keyDisplay.textContent =
                            currentKey;
                    }

                    if (copyKeyBtn) {
                        copyKeyBtn.disabled = false;
                    }

                    setStatus(
                        "KEY GENERATED SUCCESSFULLY",
                        "ready"
                    );

                    startCountdown(
                        data.remaining || 86400
                    );

                    /*
                     * SANGAT PENTING:
                     * tombol tetap disabled.
                     */
                    getKeyBtn.disabled = true;

                    showToast(
                        "KEY SUCCESSFULLY CLAIMED"
                    );

                    return;
                }

                // ==========================================
                // COOLDOWN
                // ==========================================
                if (data.cooldown === true) {

                    currentKey =
                        data.key || null;

                    if (currentKey && keyDisplay) {
                        keyDisplay.textContent =
                            currentKey;
                    }

                    if (copyKeyBtn && currentKey) {
                        copyKeyBtn.disabled = false;
                    }

                    setStatus(
                        "24 HOUR COOLDOWN",
                        "cooldown"
                    );

                    startCountdown(
                        data.remaining || 0
                    );

                    getKeyBtn.disabled = true;

                    return;
                }

                // ==========================================
                // ALL KEYS USED
                // ==========================================
                if (
                    data.message ===
                    "ALL KEYS ARE USED"
                ) {
                    setStatus(
                        "ALL KEYS ARE USED",
                        "error"
                    );

                    getKeyBtn.disabled = true;

                    showToast(
                        "ALL KEYS ARE USED"
                    );

                    return;
                }

                // ==========================================
                // OTHER SERVER RESPONSE
                // ==========================================
                setStatus(
                    data.message ||
                    "FAILED TO GET KEY",
                    "error"
                );

                /*
                 * Karena belum berhasil claim,
                 * user masih boleh mencoba lagi.
                 */
                getKeyBtn.disabled = false;

            } catch (error) {

                console.error(
                    "GET KEY error:",
                    error
                );

                setStatus(
                    "NETWORK / SERVER ERROR",
                    "error"
                );

                showToast(
                    "SERVER ERROR"
                );

                /*
                 * Request gagal sebelum claim sukses,
                 * jadi tombol boleh dicoba lagi.
                 */
                getKeyBtn.disabled = false;

            } finally {

                isRequesting = false;

                setLoading(false);

                /*
                 * JANGAN meng-enable tombol di sini.
                 *
                 * Kalau claim sukses:
                 * tombol tetap disabled.
                 *
                 * Kalau cooldown:
                 * tombol tetap disabled.
                 *
                 * Hanya error yang mengaktifkan kembali
                 * tombol di blok masing-masing.
                 */
            }
        }
    );
}

// ==================================================
// COPY KEY
// ==================================================
if (copyKeyBtn) {
    copyKeyBtn.addEventListener(
        "click",
        async () => {

            if (!currentKey) {
                return;
            }

            try {

                if (
                    navigator.clipboard &&
                    navigator.clipboard.writeText
                ) {

                    await navigator.clipboard
                        .writeText(currentKey);

                } else {

                    const input =
                        document.createElement(
                            "textarea"
                        );

                    input.value = currentKey;

                    input.style.position =
                        "fixed";

                    input.style.opacity = "0";

                    document.body.appendChild(
                        input
                    );

                    input.focus();
                    input.select();

                    document.execCommand(
                        "copy"
                    );

                    input.remove();
                }

                showToast(
                    "KEY COPIED TO CLIPBOARD"
                );

            } catch (error) {

                console.error(
                    "Copy error:",
                    error
                );

                showToast(
                    "FAILED TO COPY KEY"
                );
            }
        }
    );
}

// ==================================================
// INITIALIZE
// ==================================================
document.addEventListener(
    "DOMContentLoaded",
    () => {
        checkStatusOnLoad();
    }
);
