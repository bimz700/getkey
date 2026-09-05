const keyElement = document.getElementById("key");
const getButton = document.getElementById("getKey");
const copyButton = document.getElementById("copyKey");
const statusElement = document.getElementById("status");
const systemElement = document.getElementById("system");
let currentKey = "";
function getDeviceId() { const k = "mzmodz_device_id"; let id = localStorage.getItem(k); if (!id) { id = crypto.randomUUID(); localStorage.setItem(k, id); } return id; }
async function checkSystem() {
  try {
    const r = await fetch("/api/getkey?action=check", { headers: { "X-Device-Identifier": getDeviceId() }, cache: "no-store" });
    const d = await r.json();
    if (d.maintenance) { systemElement.textContent = d.message; getButton.disabled = true; statusElement.textContent = "MAINTENANCE"; return false; }
    if (d.updateMode) { systemElement.textContent = d.message + (d.version ? ` Version ${d.version}.` : ""); getButton.disabled = true; statusElement.textContent = "UPDATE REQUIRED"; return false; }
    return true;
  } catch { statusElement.textContent = "Gagal mengecek server."; return false; }
}
getButton.onclick = async () => { getButton.disabled = true; statusElement.textContent = "Mengambil key..."; try { const r = await fetch("/api/getkey", { method: "POST", headers: { "Content-Type": "application/json", "X-Device-Identifier": getDeviceId() }, cache: "no-store" }); const d = await r.json(); if (!d.success) { statusElement.textContent = d.message || "NO KEY AVAILABLE"; getButton.disabled = false; return; } currentKey = d.key; keyElement.textContent = currentKey; copyButton.disabled = false; statusElement.textContent = d.existing ? "Device sudah terdaftar pada key ini." : "Key berhasil didapat."; getButton.textContent = "KEY CLAIMED"; } catch { statusElement.textContent = "SERVER ERROR. Coba lagi."; getButton.disabled = false; } };
copyButton.onclick = async () => { if (!currentKey) return; try { await navigator.clipboard.writeText(currentKey); statusElement.textContent = "Key berhasil disalin."; } catch {} };
checkSystem();
