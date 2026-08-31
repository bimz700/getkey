// ==================================================
// KONFIGURASI SHORTLINK
// ==================================================

const SHORTLINK_URL = "https://sfl.gl/cSXqDyqz";

// true = redirect ke ShortLink HANYA ketika halaman
// di-refresh dalam kondisi device masih cooldown.
const ENABLE_SHORTLINK = true;

const SHORTLINK_DELAY = 500;

const API_URL = "/api/getkey";
const DEVICE_STORAGE_KEY = "mzmodz_device_id";

// ==================================================
// ELEMENT DOM
// Kompatibel dengan beberapa nama ID
// ==================================================

const getKeyBtn = document.getElementById("getKeyBtn");
const copyKeyBtn = document.getElementById("copyKeyBtn");
const keyDisplay = document.getElementById("keyDisplay");

const statusText =
    document.getElementById("statusText") ||
    document.getElementById("statusMessage");

const statusDot =
    document.getElementById("statusDot");

const countdownEl =
    document.getElementById("countdown");

const toastEl =
    document.getElementById("toast");

const btnText =
    getKeyBtn
        ? getKeyBtn.querySelector(".btn-text")
        : null;

const btnLoader =
    getKeyBtn
        ? (
            getKeyBtn.querySelector(".btn-loader") ||
            getKeyBtn.querySelector(".spinner")
        )
        : null;


// ==================================================
// VARIABLE
// ==================================================

let countdownInterval = null;
let currentKey = null;

let isRequesting = false;

// Menandakan GET KEY berhasil dilakukan pada sesi
// halaman yang sedang aktif.
let hasSuccessfullyClaimed = false;


// ==================================================
// DEVICE ID
// ==================================================

function getDeviceId() {

    let deviceId =
        localStorage.getItem(
            DEVICE_STORAGE_KEY
        );

    if (!deviceId) {

        if (
            window.crypto &&
            crypto.randomUUID
        ) {

            deviceId =
                "mz_" +
                crypto.randomUUID();

        } else {

            deviceId =
                "mz_" +
                Math.random()
                    .toString(36)
                    .substring(2) +
                Date.now();

        }

        localStorage.setItem(
            DEVICE_STORAGE_KEY,
            deviceId
        );
    }

    return deviceId;
}


// ==================================================
// DETEKSI REFRESH
// ==================================================

function isPageRefresh() {

    try {

        const navigation =
            performance.getEntriesByType(
                "navigation"
            )[0];

        if (navigation) {

            return (
                navigation.type === "reload"
            );
        }

    } catch (error) {

        console.warn(
            "Navigation detection failed:",
            error
        );
    }

    return false;
}


// ==================================================
// TOAST
// ==================================================

function showToast(
    message,
    duration = 3000
) {

    if (!toastEl) {
        return;
    }

    toastEl.textContent = message;

    toastEl.classList.remove(
        "hidden"
    );

    setTimeout(() => {

        toastEl.classList.add(
            "hidden"
        );

    }, duration);
}


// ==================================================
// FORMAT COUNTDOWN
// ==================================================

function formatTime(seconds) {

    seconds =
        Math.max(
            0,
            Number(seconds) || 0
        );

    const hours =
        Math.floor(
            seconds / 3600
        );

    const minutes =
        Math.floor(
            (seconds % 3600) / 60
        );

    const secs =
        Math.floor(
            seconds % 60
        );

    const pad = (number) =>
        String(number).padStart(
            2,
            "0"
        );

    return (
        `${pad(hours)}:` +
        `${pad(minutes)}:` +
        `${pad(secs)}`
    );
}


// ==================================================
// STATUS
// ==================================================

function setStatus(
    message,
    type = "ready"
) {

    if (statusText) {

        statusText.textContent =
            message;
    }

    if (statusDot) {

        statusDot.className =
            "status-dot";

        if (type === "cooldown") {

            statusDot.classList.add(
                "cooldown"
            );
        }

        if (type === "error") {

            statusDot.classList.add(
                "error"
            );
        }
    }
}


// ==================================================
// LOADING
// ==================================================

function setLoading(
    loading
) {

    if (!getKeyBtn) {
        return;
    }

    if (loading) {

        getKeyBtn.disabled = true;

        if (btnText) {

            btnText.classList.add(
                "hidden"
            );
        }

        if (btnLoader) {

            btnLoader.classList.remove(
                "hidden"
            );
        }

    } else {

        if (btnText) {

            btnText.classList.remove(
                "hidden"
            );
        }

        if (btnLoader) {

            btnLoader.classList.add(
                "hidden"
            );
        }

        /*
         * Jangan mengubah disabled di sini.
         *
         * Setelah GET KEY sukses, tombol harus
         * tetap disabled.
         */
    }
}


// ==================================================
// START COUNTDOWN
// ==================================================

function startCountdown(
    durationSeconds
) {

    if (countdownInterval) {

        clearInterval(
            countdownInterval
        );

        countdownInterval = null;
    }

    let remaining =
        Math.max(
            0,
            Number(durationSeconds) || 0
        );

    if (countdownEl) {

        countdownEl.classList.remove(
            "hidden"
        );

        countdownEl.textContent =
            formatTime(
                remaining
            );
    }

    if (remaining <= 0) {

        checkStatusOnLoad();

        return;
    }

    countdownInterval =
        setInterval(() => {

            remaining--;

            if (countdownEl) {

                countdownEl.textContent =
                    formatTime(
                        remaining
                    );
            }

            if (remaining <= 0) {

                clearInterval(
                    countdownInterval
                );

                countdownInterval = null;

                if (countdownEl) {

                    countdownEl.textContent =
                        "00:00:00";
                }

                /*
                 * Jangan langsung enable tombol.
                 * Pastikan server/Redis memang sudah
                 * menghapus cooldown.
                 */
                checkStatusOnLoad();

            }

        }, 1000);
}


// ==================================================
// STOP COUNTDOWN
// ==================================================

function stopCountdown() {

    if (countdownInterval) {

        clearInterval(
            countdownInterval
        );

        countdownInterval = null;
    }

    if (countdownEl) {

        countdownEl.classList.add(
            "hidden"
        );
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

        window.location.replace(
            SHORTLINK_URL
        );

    }, SHORTLINK_DELAY);
}


// ==================================================
// CHECK STATUS SERVER
// ==================================================

async function checkStatusOnLoad() {

    const deviceId =
        getDeviceId();

    try {

        const response =
            await fetch(
                `${API_URL}?action=check`,
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


        // ==================================================
        // MASIH COOLDOWN
        // ==================================================

        if (
            data.cooldown === true
        ) {

            currentKey =
                data.key || null;

            if (
                currentKey &&
                keyDisplay
            ) {

                keyDisplay.textContent =
                    currentKey;
            }

            if (
                copyKeyBtn &&
                currentKey
            ) {

                copyKeyBtn.disabled =
                    false;
            }

            setStatus(
                "24 HOUR COOLDOWN",
                "cooldown"
            );

            startCountdown(
                data.remaining || 0
            );

            if (getKeyBtn) {

                getKeyBtn.disabled =
                    true;
            }


            // ==================================================
            // INI BAGIAN PENTING
            //
            // Kalau buka website biasa:
            // TIDAK redirect.
            //
            // Kalau refresh:
            // redirect ke ShortLink.
            // ==================================================

            if (
                ENABLE_SHORTLINK &&
                isPageRefresh()
            ) {

                redirectToShortlink();
            }

            return;
        }


        // ==================================================
        // TIDAK ADA COOLDOWN
        // ==================================================

        stopCountdown();

        if (
            !hasSuccessfullyClaimed
        ) {

            currentKey = null;

            if (keyDisplay) {

                keyDisplay.textContent =
                    "••••••••••••••";
            }

            if (copyKeyBtn) {

                copyKeyBtn.disabled =
                    true;
            }
        }

        setStatus(
            "SYSTEM READY",
            "ready"
        );

        if (
            getKeyBtn &&
            !isRequesting &&
            !hasSuccessfullyClaimed
        ) {

            getKeyBtn.disabled =
                false;
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

            // ==================================================
            // ANTI DOUBLE CLICK
            // ==================================================

            if (isRequesting) {
                return;
            }

            if (
                hasSuccessfullyClaimed
            ) {
                return;
            }

            isRequesting = true;

            getKeyBtn.disabled =
                true;

            setLoading(true);

            setStatus(
                "GENERATING KEY...",
                "ready"
            );


            try {

                const deviceId =
                    getDeviceId();


                const response =
                    await fetch(
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


                // ==================================================
                // SUCCESS
                // ==================================================

                if (
                    data.success === true
                ) {

                    currentKey =
                        data.key;

                    hasSuccessfullyClaimed =
                        true;


                    if (keyDisplay) {

                        keyDisplay.textContent =
                            currentKey;
                    }


                    if (copyKeyBtn) {

                        copyKeyBtn.disabled =
                            false;
                    }


                    setStatus(
                        "KEY GENERATED SUCCESSFULLY",
                        "ready"
                    );


                    startCountdown(
                        data.remaining ||
                        86400
                    );


                    /*
                     * WAJIB DISABLED.
                     *
                     * User tidak bisa klik GET KEY
                     * lagi pada sesi ini.
                     */
                    getKeyBtn.disabled =
                        true;


                    showToast(
                        "KEY SUCCESSFULLY CLAIMED"
                    );


                    return;
                }


                // ==================================================
                // COOLDOWN
                // ==================================================

                if (
                    data.cooldown === true
                ) {

                    currentKey =
                        data.key || null;


                    if (
                        currentKey &&
                        keyDisplay
                    ) {

                        keyDisplay.textContent =
                            currentKey;
                    }


                    if (
                        copyKeyBtn &&
                        currentKey
                    ) {

                        copyKeyBtn.disabled =
                            false;
                    }


                    setStatus(
                        "24 HOUR COOLDOWN",
                        "cooldown"
                    );


                    startCountdown(
                        data.remaining || 0
                    );


                    getKeyBtn.disabled =
                        true;


                    return;
                }


                // ==================================================
                // ALL KEYS USED
                // ==================================================

                if (
                    data.message ===
                    "ALL KEYS ARE USED"
                ) {

                    setStatus(
                        "ALL KEYS ARE USED",
                        "error"
                    );


                    getKeyBtn.disabled =
                        true;


                    showToast(
                        "ALL KEYS ARE USED"
                    );


                    return;
                }


                // ==================================================
                // SERVER MESSAGE
                // ==================================================

                setStatus(
                    data.message ||
                    "FAILED TO GET KEY",
                    "error"
                );


                getKeyBtn.disabled =
                    false;


            } catch (error) {

                console.error(
                    "GET KEY ERROR:",
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
                 * Request gagal.
                 * Belum berhasil claim.
                 * Jadi masih boleh mencoba lagi.
                 */
                getKeyBtn.disabled =
                    false;


            } finally {

                isRequesting =
                    false;

                setLoading(false);

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
                        .writeText(
                            currentKey
                        );

                } else {

                    const textarea =
                        document.createElement(
                            "textarea"
                        );

                    textarea.value =
                        currentKey;

                    textarea.style.position =
                        "fixed";

                    textarea.style.opacity =
                        "0";

                    document.body.appendChild(
                        textarea
                    );

                    textarea.focus();
                    textarea.select();

                    document.execCommand(
                        "copy"
                    );

                    textarea.remove();
                }


                showToast(
                    "KEY COPIED TO CLIPBOARD"
                );


            } catch (error) {

                console.error(
                    "COPY ERROR:",
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
// INITIAL LOAD
// ==================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        checkStatusOnLoad();

    }
);
