import { getApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

const auth = getAuth(getApp());
const $ = id => document.getElementById(id);

const el = {
  email: $("sellerEmail"), stats: $("sellerStats"), table: $("sellerTable"),
  status: $("sellerStatus"), fresh: $("sellerNew"), hint: $("sellerLimitHint"),
  duration: $("sellerDuration"), customDays: $("sellerCustomDays"),
  maxDevices: $("sellerMaxDevices"), count: $("sellerCount"),
  genBtn: $("sellerGenBtn"), refreshBtn: $("sellerRefreshBtn"),
  switchBtn: $("sellerSwitchBtn"), logoutBtn: $("sellerLogoutBtn")
};

let me = null;
let cache = [];

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
const fmt = ts => (ts ? new Date(ts).toLocaleString("id-ID") : "-");
const fmtExpiry = ts => (Number(ts) > 0 ? fmt(ts) : "UNLIMITED");

async function api(options = {}) {
  if (!auth.currentUser) throw new Error("NOT_AUTHENTICATED");
  const token = await auth.currentUser.getIdToken();
  const response = await fetch("/api/seller", {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
  return data;
}

function renderStats(stats) {
  const cards = [
    ["Total key", stats.total], ["Active", stats.active], ["Expired", stats.expired],
    ["Revoked / disabled", stats.revoked + stats.disabled], ["Belum dipakai", stats.unused],
    ["Device terpakai", stats.devicesBound], ["Segera habis (3 hari)", stats.expiringSoon],
    ["Dibuat hari ini", stats.createdToday], ["Dibuat 7 hari", stats.createdLast7Days]
  ];
  el.stats.innerHTML = cards
    .map(([label, value]) => `<div class="statCard"><b>${esc(value)}</b><span>${esc(label)}</span></div>`)
    .join("");
}

function renderKeys(keys) {
  el.table.innerHTML = keys.length
    ? keys.map(key => {
        const max = Number(key.maxDevices || 0);
        const badge = key.status === "ACTIVE" ? "on" : key.status === "EXPIRED" ? "exp" : "off";
        const claims = key.claims.length
          ? key.claims.map((claim, index) => `
              <div class="claim">
                <b>DEVICE:</b> ${claim.deviceIndex > 0 ? claim.deviceIndex : index + 1}${max > 0 ? "/" + max : ""}<br>
                <b>Device:</b> ${esc(claim.device)}${claim.model ? " (" + esc(claim.model) + ")" : ""}<br>
                <b>Bound:</b> ${esc(fmt(claim.claimedAt))}
              </div>`).join("")
          : `<div class="muted">Belum ada device.</div>`;
        const k = esc(key.key);
        return `
          <tr>
            <td class="key">${k}</td>
            <td><span class="badge ${badge}">${esc(key.status)}</span></td>
            <td>${key.claimCount}/${max > 0 ? max : "∞"}</td>
            <td>${esc(fmtExpiry(key.expiresAt))}</td>
            <td>${esc(fmt(key.createdAt))}</td>
            <td>
              <button data-s-view="${k}">DEVICES</button>
              <button class="copy" data-s-copy="${k}">COPY</button>
            </td>
          </tr>
          <tr class="detailsRow hidden" data-s-details="${k}">
            <td colspan="6"><div class="details">${claims}</div></td>
          </tr>`;
      }).join("")
    : `<tr><td colspan="6" class="muted">Belum ada key. Buat key pertama Anda di atas.</td></tr>`;
}

async function load() {
  el.status.textContent = "Loading...";
  try {
    const data = await api({ method: "GET" });
    cache = data.keys || [];
    renderStats(data.stats || {});
    renderKeys(cache);
    me = { ...me, limits: data.limits || me?.limits };
    if (me?.limits) {
      el.hint.textContent = `Batas akun Anda: maks ${me.limits.maxDurationDays} hari dan ${me.limits.maxDevices} device per key. Revoke/extend dilakukan Admin.`;
      el.maxDevices.max = me.limits.maxDevices;
    }
    el.status.textContent = `${cache.length} key.`;
  } catch (error) {
    el.status.textContent = "Gagal: " + error.message;
  }
}

document.addEventListener("mz:seller-open", event => {
  me = event.detail;
  el.email.textContent = (me.email || "") + (me.owner ? " · OWNER" : "");
  el.switchBtn.classList.toggle("hidden", (me.panels || []).length < 2);
  el.fresh.classList.add("hidden");
  load();
});

el.duration.onchange = () => el.customDays.classList.toggle("hidden", el.duration.value !== "custom");
el.switchBtn.onclick = () => document.dispatchEvent(new CustomEvent("mz:switch-panel"));
el.logoutBtn.onclick = () => document.dispatchEvent(new CustomEvent("mz:logout"));
el.refreshBtn.onclick = () => load();

el.genBtn.onclick = async () => {
  const days = el.duration.value === "custom" ? Number(el.customDays.value) : Number(el.duration.value);
  el.genBtn.disabled = true;
  el.status.textContent = "Membuat key...";
  try {
    const data = await api({
      method: "POST",
      body: JSON.stringify({ action: "createKey", durationDays: days, maxDevices: Number(el.maxDevices.value), count: Number(el.count.value) })
    });
    el.fresh.textContent = data.keys.map(item => item.key).join("\n");
    el.fresh.style.whiteSpace = "pre-line";
    el.fresh.classList.remove("hidden");
    await load();
    el.status.textContent = `Dibuat ${data.keys.length} key.`;
  } catch (error) {
    el.status.textContent = "Gagal: " + error.message;
  } finally {
    el.genBtn.disabled = false;
  }
};

el.table.addEventListener("click", async event => {
  const view = event.target.closest("[data-s-view]");
  const copy = event.target.closest("[data-s-copy]");
  if (view) {
    const row = [...el.table.querySelectorAll("[data-s-details]")].find(item => item.dataset.sDetails === view.dataset.sView);
    if (row) row.classList.toggle("hidden");
  } else if (copy) {
    try {
      await navigator.clipboard.writeText(copy.dataset.sCopy);
      el.status.textContent = "Key disalin.";
    } catch {
      el.status.textContent = "Gagal menyalin. Salin manual.";
    }
  }
});
