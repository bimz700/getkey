(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const btn = $("getKeyBtn"), btnLabel = $("btnLabel"), spinner = $("btnSpinner");
  const notice = $("notice"), result = $("result"), copyBtn = $("copyBtn");
  const els = {
    key: $("keyValue"), badge: $("statusBadge"), expires: $("expiresAt"),
    left: $("timeLeft"), devices: $("devices"), device: $("deviceRef")
  };

  const ERR = {
    RATE_LIMITED: "Terlalu banyak permintaan. Coba lagi beberapa saat lagi.",
    DEVICE_NOT_ALLOWED: "Device tidak valid atau tidak diizinkan.",
    KEY_REVOKED: "Key untuk device ini telah dicabut oleh admin.",
    MAINTENANCE: "Sedang maintenance. Coba lagi nanti.",
    SERVER_ERROR: "Terjadi kesalahan server. Coba lagi."
  };

  /* Device identifier: acak 128-bit (Web Crypto), disimpan di browser ini saja. */
  let memoryId = null;
  function deviceId() {
    try {
      let id = localStorage.getItem("mzmodz_device_id");
      if (id && /^[a-f0-9]{32}$/.test(id)) return id;
      id = randomHex();
      localStorage.setItem("mzmodz_device_id", id);
      return id;
    } catch {
      return (memoryId = memoryId || randomHex());
    }
  }
  function randomHex() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  }

  async function api(method) {
    const response = await fetch("/api/generate-key", {
      method,
      headers: { "X-Device-Identifier": deviceId() },
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      const code = data.error || "SERVER_ERROR";
      const error = new Error(data.message || ERR[code] || ERR.SERVER_ERROR);
      error.code = code;
      throw error;
    }
    return data;
  }

  function setLoading(on) {
    btn.disabled = on;
    spinner.classList.toggle("hidden", !on);
    btnLabel.textContent = on ? "GENERATING..." : btn.dataset.label || "GET KEY";
  }
  function show(type, text) {
    notice.className = "gk-notice " + type;
    notice.textContent = text;
  }
  function hideNotice() { notice.className = "gk-notice hidden"; notice.textContent = ""; }

  let current = null, timer = null;

  function fmtLeft(ms) {
    if (ms <= 0) return "Habis";
    const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
    return d > 0 ? `${d}h ${h}j ${m}m` : `${h}j ${m}m`;
  }

  function render() {
    if (!current) return;
    const expired = current.expiresAt > 0 && Date.now() >= current.expiresAt;
    const status = expired ? "EXPIRED" : current.status;
    els.badge.textContent = status;
    els.badge.className = "badge " + (status === "ACTIVE" ? "on" : status === "EXPIRED" ? "exp" : "off");
    els.left.textContent = current.expiresAt > 0 ? fmtLeft(current.expiresAt - Date.now()) : "Tanpa batas";
    if (expired || status !== "ACTIVE") {
      btn.dataset.label = "GET NEW KEY";
      btnLabel.textContent = "GET NEW KEY";
      btn.classList.remove("hidden");
    }
  }

  function showKey(data) {
    current = data;
    els.key.textContent = data.key;
    els.expires.textContent = data.expiresAt > 0 ? new Date(data.expiresAt).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" }) : "Tanpa batas";
    const d = data.devices || { used: 0, max: 0 };
    els.devices.textContent = `${d.used} / ${d.max > 0 ? d.max : "∞"}`;
    els.device.textContent = data.device || "-";
    result.classList.remove("hidden");
    render();
    clearInterval(timer);
    timer = setInterval(render, 30000);
    if (data.status === "ACTIVE") {
      btn.classList.add("hidden");
    }
  }

  btn.addEventListener("click", async () => {
    hideNotice();
    setLoading(true);
    try {
      const data = await api("POST");
      showKey(data);
      show("success", data.existing ? "Key aktif untuk device ini ditemukan." : "Key berhasil dibuat.");
    } catch (error) {
      show("error", error.message);
    } finally {
      setLoading(false);
    }
  });

  copyBtn.addEventListener("click", async () => {
    if (!current) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(current.key);
      } else {
        const area = document.createElement("textarea");
        area.value = current.key;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        const done = document.execCommand("copy");
        area.remove();
        if (!done) throw new Error("copy failed");
      }
      copyBtn.textContent = "COPIED";
      show("success", "Key disalin ke clipboard.");
    } catch {
      show("error", "Gagal menyalin. Pilih dan salin key secara manual.");
    }
    setTimeout(() => { copyBtn.textContent = "COPY"; }, 1800);
  });

  /* Saat halaman dibuka: tampilkan key milik device ini jika sudah ada (tanpa membuat baru). */
  (async () => {
    btn.dataset.label = "GET KEY";
    try {
      const data = await api("GET");
      if (data.hasKey) showKey(data);
    } catch (error) {
      if (error.code === "RATE_LIMITED" || error.code === "MAINTENANCE") show("error", error.message);
    }
  })();
})();
