const SHORTLINK_URL = "https://sfl.gl/cSXqDyqz";
const ENABLE_SHORTLINK = true;
const COOLDOWN_SECONDS = 86400;

const keyElement = document.getElementById("key");
const getButton = document.getElementById("getKey");
const copyButton = document.getElementById("copyKey");
const statusElement = document.getElementById("status");
const countdownElement = document.getElementById("countdown");

let currentKey = "";
let claimed = false;
let timer = null;

function getDeviceId() {
  const storageKey = "mzmodz_device_id";
  let id = localStorage.getItem(storageKey);

  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(storageKey, id);
  }

  return id;
}

function isRefresh() {
  const entry = performance.getEntriesByType("navigation")[0];
  return entry && entry.type === "reload";
}

function formatTime(seconds) {
  seconds = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")} : ${String(m).padStart(2, "0")} : ${String(s).padStart(2, "0")}`;
}

function startCountdown(seconds) {
  clearInterval(timer);
  let remaining = Math.max(0, Number(seconds) || 0);

  const tick = () => {
    if (remaining <= 0) {
      clearInterval(timer);
      countdownElement.textContent = "";
      getButton.disabled = false;
      claimed = false;
      statusElement.textContent = "Cooldown selesai. Kamu bisa claim lagi.";
      return;
    }

    countdownElement.textContent = `Cooldown: ${formatTime(remaining)}`;
    remaining--;
  };

  tick();
  timer = setInterval(tick, 1000);
}

function lockButton() {
  getButton.disabled = true;
  getButton.textContent = "KEY CLAIMED";
}

async function checkCooldown() {
  try {
    const response = await fetch("/api/getkey?action=check", {
      headers: { "X-Device-Identifier": getDeviceId() },
      cache: "no-store"
    });

    const data = await response.json();

    if (!data.cooldown) return;

    currentKey = data.key || "";
    claimed = true;
    lockButton();

    if (currentKey) {
      keyElement.textContent = currentKey;
      copyButton.disabled = false;
    }

    statusElement.textContent = "Device ini sudah claim key.";
    startCountdown(data.remaining);

    if (isRefresh() && ENABLE_SHORTLINK) {
      setTimeout(() => {
        window.location.href = SHORTLINK_URL;
      }, 500);
    }
  } catch (error) {
    console.error(error);
    statusElement.textContent = "Gagal mengecek status server.";
  }
}

getButton.addEventListener("click", async () => {
  if (claimed || getButton.disabled) return;

  getButton.disabled = true;
  getButton.textContent = "LOADING...";
  statusElement.textContent = "Mengambil key...";

  try {
    const response = await fetch("/api/getkey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Identifier": getDeviceId()
      },
      cache: "no-store"
    });

    const data = await response.json();

    if (!data.success) {
      if (data.cooldown) {
        claimed = true;
        currentKey = data.key || "";
        lockButton();
        if (currentKey) {
          keyElement.textContent = currentKey;
          copyButton.disabled = false;
        }
        statusElement.textContent = "Device ini sudah claim key.";
        startCountdown(data.remaining);
        return;
      }

      getButton.disabled = false;
      getButton.textContent = "GET KEY";
      statusElement.textContent = data.message || "Gagal mendapatkan key.";
      return;
    }

    currentKey = data.key;
    claimed = true;
    keyElement.textContent = currentKey;
    copyButton.disabled = false;
    lockButton();
    statusElement.textContent = "Key berhasil didapat.";
    startCountdown(data.remaining || COOLDOWN_SECONDS);
  } catch (error) {
    console.error(error);
    getButton.disabled = false;
    getButton.textContent = "GET KEY";
    statusElement.textContent = "SERVER ERROR. Coba lagi.";
  }
});

copyButton.addEventListener("click", async () => {
  if (!currentKey) return;

  try {
    await navigator.clipboard.writeText(currentKey);
    statusElement.textContent = "Key berhasil disalin.";
  } catch (error) {
    statusElement.textContent = "Gagal menyalin key.";
  }
});

checkCooldown();
