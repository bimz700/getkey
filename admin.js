import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import firebaseConfig from "./firebase-config.js";

const auth = getAuth(initializeApp(firebaseConfig));
const $ = id => document.getElementById(id);
const loginCard = $("loginCard"), panel = $("panel"), loginBtn = $("loginBtn"), loginStatus = $("loginStatus");
const email = $("email"), password = $("password"), adminEmail = $("adminEmail"), logoutBtn = $("logoutBtn");
const keyInput = $("keyInput"), maxDevices = $("maxDevices"), keyStatus = $("keyStatusSelect"), saveKeyBtn = $("saveKeyBtn"), keyTable = $("keyTable");
const refreshBtn = $("refreshBtn"), maintenance = $("maintenance"), updateMode = $("updateMode"), maintenanceMessage = $("maintenanceMessage"), updateMessage = $("updateMessage"), version = $("version"), downloadUrl = $("downloadUrl"), saveSystemBtn = $("saveSystemBtn"), panelStatus = $("panelStatus");

async function apiRequest(options = {}) {
  if (!auth.currentUser) throw new Error("NOT_AUTHENTICATED");
  const token = await auth.currentUser.getIdToken();
  const response = await fetch("/api/admin", { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) }, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
  return data;
}
function esc(v) { return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function date(ms) { return ms ? new Date(ms).toLocaleString("id-ID") : "-"; }
function render(keys) {
  keyTable.innerHTML = keys.map(k => {
    const claims = k.claims || [], max = Number(k.maxDevices || 0);
    const devices = max > 0 ? `${claims.length}/${max}` : `${claims.length}/∞`;
    const details = claims.length ? claims.map(c => `<div class="claim"><b>Device:</b> ${esc(c.device)}<br><b>IP:</b> ${esc(c.ip)}<br><b>Time:</b> ${esc(date(c.claimedAt))}</div>`).join("") : `<div class="muted">Belum ada device.</div>`;
    return `<tr><td class="key">${esc(k.key)}</td><td><span class="badge ${k.status === "disabled" ? "off" : "on"}">${k.status.toUpperCase()}</span></td><td>${devices}</td><td>${date(k.createdAt)}</td><td><button data-view="${esc(k.key)}">DEVICES</button> <button data-action="${k.status === "disabled" ? "enable" : "disable"}" data-key="${esc(k.key)}">${k.status === "disabled" ? "ENABLE" : "DISABLE"}</button> <button class="danger" data-delete="${esc(k.key)}">DELETE</button></td></tr><tr class="detailsRow hidden" data-details="${esc(k.key)}"><td colspan="5"><div class="details">${details}</div></td></tr>`;
  }).join("");
}
async function load() {
  panelStatus.textContent = "Loading...";
  try {
    const data = await apiRequest({ method: "GET" });
    render(data.keys || []);
    const s = data.system || {};
    maintenance.checked = !!s.maintenance; updateMode.checked = !!s.updateMode;
    maintenanceMessage.value = s.maintenanceMessage || ""; updateMessage.value = s.updateMessage || ""; version.value = s.version || ""; downloadUrl.value = s.downloadUrl || "";
    panelStatus.textContent = `${(data.keys || []).length} key.`;
  } catch (e) { panelStatus.textContent = e.message; }
}
loginBtn.onclick = async () => { loginBtn.disabled = true; loginStatus.textContent = "Logging in..."; try { await signInWithEmailAndPassword(auth, email.value.trim(), password.value); } catch (e) { loginStatus.textContent = e.code || e.message; loginBtn.disabled = false; } };
logoutBtn.onclick = () => signOut(auth);
saveKeyBtn.onclick = async () => { const key = keyInput.value.trim().toUpperCase(); if (!key) return (keyStatus.textContent = "Isi key dulu."); saveKeyBtn.disabled = true; try { await apiRequest({ method: "POST", body: JSON.stringify({ action: "saveKey", key, maxDevices: Number(maxDevices.value) || 0, status: keyStatus.value }) }); keyInput.value = ""; keyStatus.textContent = "Key tersimpan."; await load(); } catch (e) { keyStatus.textContent = e.message; } finally { saveKeyBtn.disabled = false; } };
saveSystemBtn.onclick = async () => { saveSystemBtn.disabled = true; try { await apiRequest({ method: "POST", body: JSON.stringify({ action: "saveSystem", maintenance: maintenance.checked, updateMode: updateMode.checked, maintenanceMessage: maintenanceMessage.value, updateMessage: updateMessage.value, version: version.value, downloadUrl: downloadUrl.value }) }); panelStatus.textContent = "System settings tersimpan."; } catch (e) { panelStatus.textContent = e.message; } finally { saveSystemBtn.disabled = false; } };
keyTable.onclick = async e => { const view = e.target.closest("[data-view]"); if (view) { $("keyTable").querySelector(`[data-details="${CSS.escape(view.dataset.view)}"]`)?.classList.toggle("hidden"); return; } const action = e.target.closest("[data-action]"); const del = e.target.closest("[data-delete]"); try { if (action) { action.disabled = true; await apiRequest({ method: "POST", body: JSON.stringify({ action: "setStatus", key: action.dataset.key, status: action.dataset.action === "disable" ? "disabled" : "active" }) }); await load(); } else if (del && confirm(`Hapus key ${del.dataset.delete}?`)) { await apiRequest({ method: "POST", body: JSON.stringify({ action: "deleteKey", key: del.dataset.delete }) }); await load(); } } catch (err) { panelStatus.textContent = err.message; } };
refreshBtn.onclick = () => load();

onAuthStateChanged(auth, user => { if (!user) { loginCard.classList.remove("hidden"); panel.classList.add("hidden"); return; } loginCard.classList.add("hidden"); panel.classList.remove("hidden"); adminEmail.textContent = user.email || ""; load(); });
