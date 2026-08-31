const SHORTLINK_URL = "https://sfl.gl/cSXqDyqz";
const ENABLE_SHORTLINK = true;
const SHORTLINK_DELAY = 500;
const API_URL = "/api/getkey";
const STORAGE_KEY = "mzmodz_device_id";

const getKeyBtn = document.getElementById("getKeyBtn");
const copyKeyBtn = document.getElementById("copyKeyBtn");
const keyDisplay = document.getElementById("keyDisplay");
const statusText = document.getElementById("statusText");
const statusDot = document.getElementById("statusDot");
const countdownEl = document.getElementById("countdown");
const toastEl = document.getElementById("toast");
const btnText = getKeyBtn?.querySelector(".btn-text");
const btnLoader = getKeyBtn?.querySelector(".btn-loader");

let countdownInterval = null;
let currentKey = null;
let isRequesting = false;
let claimedThisSession = false;

function getDeviceId() {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = "mz_" + crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

function showToast(message, duration = 3000) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  setTimeout(() => toastEl.classList.add("hidden"), duration);
}

function formatTime(seconds) {
  seconds = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map(n => String(n).padStart(2, "0")).join(":");
}

function setStatus(text, type = "ready") {
  if (statusText) statusText.textContent = text;
  if (statusDot) {
    statusDot.className = "status-dot";
    if (type === "cooldown") statusDot.classList.add("cooldown");
    if (type === "error") statusDot.classList.add("error");
  }
}

function setLoading(loading) {
  if (!getKeyBtn) return;
  if (loading) {
    getKeyBtn.disabled = true;
    btnText?.classList.add("hidden");
    btnLoader?.classList.remove("hidden");
  } else {
    btnText?.classList.remove("hidden");
    btnLoader?.classList.add("hidden");
  }
}

function stopCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = null;
}

function startCountdown(seconds) {
  stopCountdown();
  let remaining = Number(seconds) || 0;
  countdownEl?.classList.remove("hidden");
  if (countdownEl) countdownEl.textContent = formatTime(remaining);

  countdownInterval = setInterval(async () => {
    remaining--;
    if (countdownEl) countdownEl.textContent = formatTime(remaining);
    if (remaining <= 0) {
      stopCountdown();
      await checkStatusOnLoad(false);
    }
  }, 1000);
}

function redirectToShortlink() {
  if (!ENABLE_SHORTLINK) return;
  setTimeout(() => {
    window.location.replace(SHORTLINK_URL);
  }, SHORTLINK_DELAY);
}

async function checkStatusOnLoad(redirectIfCooldown = true) {
  try {
    const response = await fetch(`${API_URL}?action=check`, {
      headers: { "X-Device-Identifier": getDeviceId() },
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (data.cooldown) {
      currentKey = data.key || null;
      if (currentKey) keyDisplay.textContent = currentKey;
      copyKeyBtn.disabled = !currentKey;
      getKeyBtn.disabled = true;
      setStatus("24 HOUR COOLDOWN", "cooldown");
      startCountdown(data.remaining);

      // Hanya redirect ketika halaman dibuka kembali/di-refresh.
      if (redirectIfCooldown) redirectToShortlink();
      return;
    }

    stopCountdown();
    if (!claimedThisSession) {
      currentKey = null;
      keyDisplay.textContent = "••••••••••••••";
      copyKeyBtn.disabled = true;
    }
    getKeyBtn.disabled = false;
    setStatus("SYSTEM READY", "ready");
  } catch (error) {
    console.error("Status check error:", error);
    setStatus("SERVER ERROR", "error");
  }
}

async function requestKey() {
  if (isRequesting || claimedThisSession) return;
  isRequesting = true;
  getKeyBtn.disabled = true;
  setLoading(true);
  setStatus("FETCHING KEY...", "ready");

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Identifier": getDeviceId()
      },
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (data.success) {
      currentKey = data.key;
      claimedThisSession = true;
      keyDisplay.textContent = currentKey;
      copyKeyBtn.disabled = false;
      getKeyBtn.disabled = true;
      setStatus("KEY CLAIMED", "ready");
      startCountdown(data.remaining || 86400);
      showToast("KEY SUCCESSFULLY GENERATED!");
      return;
    }

    if (data.cooldown) {
      currentKey = data.key || null;
      if (currentKey) keyDisplay.textContent = currentKey;
      copyKeyBtn.disabled = !currentKey;
      getKeyBtn.disabled = true;
      setStatus("24 HOUR COOLDOWN", "cooldown");
      startCountdown(data.remaining || 0);
      showToast("DEVICE ALREADY CLAIMED A KEY");
      return;
    }

    if (data.message === "ALL KEYS ARE USED") {
      keyDisplay.textContent = "OUT OF KEYS";
      copyKeyBtn.disabled = true;
      getKeyBtn.disabled = true;
      setStatus("ALL KEYS ARE USED", "error");
      showToast("ALL KEYS ARE USED");
      return;
    }

    setStatus(data.message || "SERVER ERROR", "error");
    getKeyBtn.disabled = false;
  } catch (error) {
    console.error("GET KEY error:", error);
    setStatus("SERVER ERROR", "error");
    showToast("FAILED TO CONNECT TO SERVER");
    getKeyBtn.disabled = false;
  } finally {
    isRequesting = false;
    setLoading(false);
    if (claimedThisSession) getKeyBtn.disabled = true;
  }
}

async function copyKeyToClipboard() {
  if (!currentKey) return;
  try {
    await navigator.clipboard.writeText(currentKey);
    showToast("KEY COPIED TO CLIPBOARD!");
  } catch {
    const input = document.createElement("textarea");
    input.value = currentKey;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
    showToast("KEY COPIED TO CLIPBOARD!");
  }
}

getKeyBtn.addEventListener("click", requestKey);
copyKeyBtn.addEventListener("click", copyKeyToClipboard);
window.addEventListener("DOMContentLoaded", () => checkStatusOnLoad(true));
