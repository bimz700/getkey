import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import firebaseConfig from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);


/* =========================
   ELEMENT
========================= */

const loginCard = document.getElementById("loginCard");
const panel = document.getElementById("panel");

const loginBtn = document.getElementById("loginBtn");
const loginStatus = document.getElementById("loginStatus");

const email = document.getElementById("email");
const password = document.getElementById("password");

const adminEmail = document.getElementById("adminEmail");
const logoutBtn = document.getElementById("logoutBtn");

const keyInput = document.getElementById("keyInput");
const maxDevices = document.getElementById("maxDevices");
const keyStatus = document.getElementById("keyStatusSelect");

const saveKeyBtn = document.getElementById("saveKeyBtn");
const keyTable = document.getElementById("keyTable");

const refreshBtn = document.getElementById("refreshBtn");

const maintenance = document.getElementById("maintenance");
const updateMode = document.getElementById("updateMode");

const maintenanceMessage =
  document.getElementById("maintenanceMessage");

const updateMessage =
  document.getElementById("updateMessage");

const version =
  document.getElementById("version");

const downloadUrl =
  document.getElementById("downloadUrl");

const saveSystemBtn =
  document.getElementById("saveSystemBtn");

const panelStatus =
  document.getElementById("panelStatus");


/* =========================
   ANNOUNCEMENT
========================= */

const announcementEnabled =
  document.getElementById("announcementEnabled");

const announcementTitle =
  document.getElementById("announcementTitle");

const announcementMessage =
  document.getElementById("announcementMessage");

const saveAnnouncementBtn =
  document.getElementById("saveAnnouncementBtn");


/* =========================
   API
========================= */

async function apiRequest(options = {}) {

  if (!auth.currentUser) {
    throw new Error("NOT_AUTHENTICATED");
  }

  const token =
    await auth.currentUser.getIdToken();

  const response = await fetch("/api/admin", {
    ...options,

    headers: {
      "Content-Type": "application/json",

      Authorization:
        `Bearer ${token}`,

      ...(options.headers || {})
    },

    cache: "no-store"
  });

  const data =
    await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message ||
      `HTTP ${response.status}`
    );
  }

  return data;
}


/* =========================
   ESCAPE
========================= */

function esc(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================
   DATE
========================= */

function formatDate(timestamp) {

  if (!timestamp) {
    return "-";
  }

  return new Date(timestamp)
    .toLocaleString("id-ID");
}


/* =========================
   EXPIRY
========================= */

function formatExpiry(timestamp) {

  if (!timestamp || Number(timestamp) <= 0) {
    return "UNLIMITED";
  }

  return formatDate(timestamp);
}


function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","\'":"&#39;"}[c]||c));}

const slDestination = document.getElementById("slDestination");
const slToken = document.getElementById("slToken");
const slDuration = document.getElementById("slDuration");
const slUnit = document.getElementById("slUnit");
const slFlowId = document.getElementById("slFlowId");
const slStep = document.getElementById("slStep");
const slTotalSteps = document.getElementById("slTotalSteps");
const createShortLinkBtn = document.getElementById("createShortLinkBtn");
const shortLinkStatus = document.getElementById("shortLinkStatus");
const shortLinkTable = document.getElementById("shortLinkTable");
const publicSingleEnabled = document.getElementById("publicSingleEnabled");
const publicSingleAmount = document.getElementById("publicSingleAmount");
const publicSingleUnit = document.getElementById("publicSingleUnit");
const publicDoubleEnabled = document.getElementById("publicDoubleEnabled");
const publicDoubleAmount = document.getElementById("publicDoubleAmount");
const publicDoubleUnit = document.getElementById("publicDoubleUnit");
const publicFinalDestination = document.getElementById("publicFinalDestination");
const saveGetKeyFlowBtn = document.getElementById("saveGetKeyFlowBtn");
const getKeyFlowStatus = document.getElementById("getKeyFlowStatus");


async function loadShortLinks(){
  if (!shortLinkTable) return;
  try {
    const data = await apiRequest({method:"POST", body:JSON.stringify({action:"listShortLinks"})});
    shortLinkTable.innerHTML = (data.links||[]).map(x => {
      const url = `${location.origin}/s/${encodeURIComponent(x.token)}`;
      const status = x.usedAt ? "USED" : (x.expiresAt && Date.now() >= x.expiresAt ? "EXPIRED" : "ACTIVE");
      return `<tr><td><code>${url}</code></td><td>${escapeHtml(x.destination)}</td><td>${formatDate(x.expiresAt)}</td><td>${x.step}/${x.totalSteps}</td><td>${status}</td><td><button class="smallBtn" data-copy-sl="${escapeHtml(url)}">COPY</button> <button class="danger smallBtn" data-del-sl="${escapeHtml(x.token)}">DELETE</button></td></tr>`;
    }).join("") || `<tr><td colspan="6">Belum ada short link.</td></tr>`;
  } catch(e){ if(shortLinkStatus) shortLinkStatus.textContent="Gagal memuat short link: "+e.message; }
}

createShortLinkBtn?.addEventListener("click", async()=>{
  shortLinkStatus.textContent="Membuat...";
  try {
    const data=await apiRequest({method:"POST", body:JSON.stringify({action:"createShortLink", destination:slDestination.value.trim(), token:slToken.value.trim(), durationAmount:Number(slDuration.value), durationUnit:slUnit.value, flowId:slFlowId.value.trim(), step:Number(slStep.value), totalSteps:Number(slTotalSteps.value)})});
    shortLinkStatus.textContent=`Berhasil: ${location.origin}${data.link.url}`;
    await loadShortLinks();
  } catch(e){ shortLinkStatus.textContent="Gagal: "+e.message; }
});

saveGetKeyFlowBtn?.addEventListener("click", async()=>{
  if (getKeyFlowStatus) getKeyFlowStatus.textContent = "Menyimpan...";
  try {
    const data = await apiRequest({method:"POST", body:JSON.stringify({
      action:"saveGetKeyFlow",
      singleEnabled: !!publicSingleEnabled?.checked,
      singleAmount: Number(publicSingleAmount?.value || 1),
      singleUnit: publicSingleUnit?.value || "hour",
      doubleEnabled: !!publicDoubleEnabled?.checked,
      doubleAmount: Number(publicDoubleAmount?.value || 3),
      doubleUnit: publicDoubleUnit?.value || "hour",
      finalDestination: (publicFinalDestination?.value || "/get-key?final=1").trim()
    })});
    if (getKeyFlowStatus) getKeyFlowStatus.textContent = "Get Key flow tersimpan.";
    if (data.config) loadPublicFlowConfig(data.config);
  } catch(e) { if (getKeyFlowStatus) getKeyFlowStatus.textContent = "Gagal: "+e.message; }
});

function loadPublicFlowConfig(config) {
  const single = config?.single || {};
  const dbl = config?.double || {};
  publicSingleEnabled && (publicSingleEnabled.checked = single.enabled === true);
  publicDoubleEnabled && (publicDoubleEnabled.checked = dbl.enabled === true);
  publicFinalDestination && (publicFinalDestination.value = config?.finalDestination || single.finalDestination || dbl.finalDestination || "/get-key?final=1");
  const setDuration = (obj, amountEl, unitEl, fallback) => {
    const ms = Number(obj?.durationMs || 0);
    if (!ms) { if (amountEl) amountEl.value = fallback; return; }
    if (ms % 86400000 === 0) { amountEl && (amountEl.value = ms / 86400000); unitEl && (unitEl.value = "day"); }
    else { amountEl && (amountEl.value = Math.max(1, Math.round(ms / 3600000))); unitEl && (unitEl.value = "hour"); }
  };
  setDuration(single, publicSingleAmount, publicSingleUnit, 1);
  setDuration(dbl, publicDoubleAmount, publicDoubleUnit, 3);
}

shortLinkTable?.addEventListener("click", async(e)=>{
  const copy=e.target.closest("[data-copy-sl]");
  const del=e.target.closest("[data-del-sl]");
  if(copy){ await navigator.clipboard.writeText(copy.dataset.copySl); shortLinkStatus.textContent="Link disalin."; }
  if(del){ try { await apiRequest({method:"POST",body:JSON.stringify({action:"deleteShortLink",token:del.dataset.delSl})}); await loadShortLinks(); } catch(err){ shortLinkStatus.textContent="Gagal: "+err.message; } }
});

/* =========================
   LOAD
========================= */

async function load() {

  panelStatus.textContent = "Loading...";

  try {

    const data =
      await apiRequest({
        method: "GET"
      });


    /* =========================
       KEYS
    ========================= */

    const keys =
      Array.isArray(data.keys)
        ? data.keys
        : [];

    renderKeys(keys);


    /* =========================
       SYSTEM
    ========================= */

    const system =
      data.system || {};

    loadPublicFlowConfig(system.getKeyFlow || {});


    maintenance.checked =
      system.maintenance === true;

    updateMode.checked =
      system.updateMode === true;

    maintenanceMessage.value =
      system.maintenanceMessage || "";

    updateMessage.value =
      system.updateMessage || "";

    version.value =
      system.version || "";

    downloadUrl.value =
      system.downloadUrl || "";


    /* =========================
       ANNOUNCEMENT
    ========================= */

    const announcement =
      system.announcement || {};


    if (announcementEnabled) {

      announcementEnabled.checked =
        announcement.enabled === true;

    }


    if (announcementTitle) {

      announcementTitle.value =
        announcement.title ||
        "PENGUMUMAN";

    }


    if (announcementMessage) {

      announcementMessage.value =
        announcement.message ||
        "";

    }


    panelStatus.textContent =
      `${keys.length} key.`;
    loadShortLinks();

  } catch (error) {

    panelStatus.textContent =
      "Gagal: " + error.message;

  }
}


/* =========================
   RENDER KEYS
========================= */

function renderKeys(keys) {
  if (!keyTable) {
    return;
  }
  keyTable.innerHTML = keys.map(key => {
    const claims = Array.isArray(key.claims) ? key.claims : [];
    const max = Number(key.maxDevices || 0);
    const deviceDisplay = `${claims.length}/${max > 0 ? max : "∞"}`;
    const state = String(key.displayStatus || (key.status === "disabled" ? "DISABLED" : "ACTIVE")).toUpperCase();
    const badgeClass = state === "ACTIVE" ? "on" : state === "EXPIRED" ? "exp" : "off";
    const isDisabledLike = state === "DISABLED" || state === "REVOKED";
    const claimDetails = claims.length > 0
      ? claims.map((claim, index) => {
          const deviceIndex = Number(claim.deviceIndex || 0) > 0 ? Number(claim.deviceIndex) : index + 1;
          return `
            <div class="claim">
              <b>DEVICE:</b> ${deviceIndex}${max > 0 ? "/" + max : ""}<br>
              <b>Device:</b> ${esc(claim.device)}${claim.model ? " (" + esc(claim.model) + ")" : ""}<br>
              <b>IP:</b> ${esc(claim.ip || "unknown-ip")}<br>
              <b>Claimed:</b> ${esc(formatDate(claim.claimedAt))}
            </div>`;
        }).join("")
      : `<div class="muted">Belum ada device.</div>`;
    const revokedInfo = key.revokedAt
      ? `<div class="muted">Revoked ${esc(formatDate(key.revokedAt))} oleh ${esc(key.revokedBy || "-")}</div>`
      : "";
    const k = esc(key.key);
    return `
      <tr>
        <td class="key">${k}<span class="badge src">${esc(String(key.source || "legacy").toUpperCase())}</span>${key.sellerId ? `<span class="badge src">SELLER: ${esc(key.sellerName || "-")}</span>` : ""}</td>
        <td><span class="badge ${badgeClass}">${esc(state)}</span></td>
        <td>${deviceDisplay}</td>
        <td>${esc(formatExpiry(key.expiresAt))}</td>
        <td>${esc(formatDate(key.createdAt))}</td>
        <td>
          <button data-view="${k}">DEVICES</button>
          <button data-action="${isDisabledLike ? "enable" : "disable"}" data-key="${k}">${isDisabledLike ? "ENABLE" : "DISABLE"}</button>
          ${state === "REVOKED" ? "" : `<button data-revoke="${k}">REVOKE</button>`}
          ${Number(key.expiresAt) > 0 ? `<button data-extend="${k}">EXTEND</button>` : ""}
          <button class="danger" data-delete="${k}">DELETE</button>
        </td>
      </tr>
      <tr class="detailsRow hidden" data-details="${k}">
        <td colspan="6"><div class="details">${claimDetails}${revokedInfo}</div></td>
      </tr>`;
  }).join("");
}

/* =========================
   LOGIN
========================= */

if (loginBtn) {

  loginBtn.onclick = async () => {

    loginBtn.disabled = true;

    loginStatus.textContent =
      "Logging in...";

    try {

      await signInWithEmailAndPassword(
        auth,
        email.value.trim(),
        password.value
      );

    } catch (error) {

      loginStatus.textContent =
        error.code ||
        error.message;

      loginBtn.disabled = false;

    }

  };

}


/* =========================
   LOGOUT
========================= */

if (logoutBtn) {

  logoutBtn.onclick = async () => {

    await signOut(auth);

  };

}


/* =========================
   SAVE KEY
========================= */

if (saveKeyBtn) {

  saveKeyBtn.onclick = async () => {

    const key =
      keyInput.value
        .trim()
        .toUpperCase();


    if (!key) {

      panelStatus.textContent =
        "Key belum diisi.";

      return;

    }


    saveKeyBtn.disabled = true;


    try {

      await apiRequest({

        method: "POST",

        body: JSON.stringify({

          action: "saveKey",

          key: key,

          maxDevices:
            Number(
              maxDevices.value
            ) || 0,

          status:
            keyStatus.value

        })

      });


      keyInput.value = "";

      panelStatus.textContent =
        "Key berhasil disimpan.";

      await load();

    } catch (error) {

      panelStatus.textContent =
        "Gagal: " +
        error.message;

    } finally {

      saveKeyBtn.disabled = false;

    }

  };

}


/* =========================
   SAVE SYSTEM
========================= */

if (saveSystemBtn) {

  saveSystemBtn.onclick = async () => {

    saveSystemBtn.disabled = true;


    try {

      await apiRequest({

        method: "POST",

        body: JSON.stringify({

          action: "saveSystem",

          maintenance:
            maintenance.checked,

          maintenanceMessage:
            maintenanceMessage.value,

          updateMode:
            updateMode.checked,

          updateMessage:
            updateMessage.value,

          version:
            version.value,

          downloadUrl:
            downloadUrl.value

        })

      });


      panelStatus.textContent =
        "App Control berhasil disimpan.";

      await load();

    } catch (error) {

      panelStatus.textContent =
        "Gagal: " +
        error.message;

    } finally {

      saveSystemBtn.disabled = false;

    }

  };

}


/* =========================
   SAVE ANNOUNCEMENT
========================= */

if (saveAnnouncementBtn) {

  saveAnnouncementBtn.onclick = async () => {

    saveAnnouncementBtn.disabled =
      true;


    try {

      const enabled =
        announcementEnabled
          ? announcementEnabled.checked
          : false;


      const title =
        announcementTitle
          ? announcementTitle.value.trim()
          : "PENGUMUMAN";


      const message =
        announcementMessage
          ? announcementMessage.value.trim()
          : "";


      if (!title) {

        throw new Error(
          "Judul pengumuman belum diisi."
        );

      }


      if (!message) {

        throw new Error(
          "Isi pengumuman belum diisi."
        );

      }


      await apiRequest({

        method: "POST",

        body: JSON.stringify({

          action:
            "saveAnnouncement",

          enabled:
            enabled,

          title:
            title,

          message:
            message

        })

      });


      panelStatus.textContent =
        "Announcement berhasil disimpan.";


      await load();

    } catch (error) {

      panelStatus.textContent =
        "Gagal: " +
        error.message;

    } finally {

      saveAnnouncementBtn.disabled =
        false;

    }

  };

}


/* =========================
   KEY ACTION
========================= */

if (keyTable) {

  keyTable.onclick = async event => {

    const viewButton =
      event.target.closest(
        "[data-view]"
      );


    if (viewButton) {

      const key =
        viewButton.dataset.view;

      const details =
        keyTable.querySelector(
          `[data-details="${CSS.escape(key)}"]`
        );


      if (details) {

        details.classList.toggle(
          "hidden"
        );

      }

      return;

    }


    const actionButton =
      event.target.closest(
        "[data-action]"
      );


    const deleteButton =
      event.target.closest(
        "[data-delete]"
      );


    try {

      if (actionButton) {

        actionButton.disabled = true;


        const action =
          actionButton.dataset.action;


        await apiRequest({

          method: "POST",

          body: JSON.stringify({

            action:
              "setStatus",

            key:
              actionButton.dataset.key,

            status:
              action === "disable"
                ? "disabled"
                : "active"

          })

        });


        await load();

        return;

      }


      if (deleteButton) {

        const key =
          deleteButton.dataset.delete;


        if (
          !confirm(
            `Hapus key ${key}?`
          )
        ) {

          return;

        }


        await apiRequest({

          method: "POST",

          body: JSON.stringify({

            action:
              "deleteKey",

            key:
              key

          })

        });


        await load();

      }

    } catch (error) {

      panelStatus.textContent =
        "Gagal: " +
        error.message;

    }

  };

}


/* =========================
   REFRESH
========================= */

if (refreshBtn) {

  refreshBtn.onclick = () =>
    load();

}


/* =========================
   AUTH
========================= */

const panelSelect = document.getElementById("panelSelect");
const sellerPanel = document.getElementById("sellerPanel");
const selectUser = document.getElementById("selectUser");
const switchPanelBtn = document.getElementById("switchPanelBtn");
let me = null;

async function fetchMe() {
  const token = await auth.currentUser.getIdToken();
  const response = await fetch("/api/me", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `HTTP ${response.status}`);
    error.code = data.error || "SERVER_ERROR";
    throw error;
  }
  return data;
}

function showOnly(name) {
  loginCard.classList.toggle("hidden", name !== "login");
  panelSelect.classList.toggle("hidden", name !== "select");
  panel.classList.toggle("hidden", name !== "admin");
  sellerPanel.classList.toggle("hidden", name !== "seller");
}

function openPanel(name, remember) {
  if (remember) sessionStorage.setItem("mzmodz_panel", name);
  if (name === "admin") {
    showOnly("admin");
    adminEmail.textContent = (me.email || "") + (me.owner ? " · OWNER" : " · ADMIN");
    switchPanelBtn.classList.toggle("hidden", me.panels.length < 2);
    document.getElementById("userSection").classList.toggle("hidden", !me.owner);
    document.getElementById("getKeyFlowSection")?.classList.toggle("hidden", !me.owner);
    load();
    loadAudit();
    if (me.owner) loadUsers();
  } else {
    showOnly("seller");
    document.dispatchEvent(new CustomEvent("mz:seller-open", { detail: me }));
  }
}

function showSelector() {
  sessionStorage.removeItem("mzmodz_panel");
  selectUser.textContent = me.email + (me.owner ? " · OWNER" : "");
  showOnly("select");
}

function routeAfterLogin() {
  const remembered = sessionStorage.getItem("mzmodz_panel");
  if (remembered && me.panels.includes(remembered)) return openPanel(remembered, false);
  if (me.panels.length === 1) return openPanel(me.panels[0], false);
  showSelector();
}

document.addEventListener("mz:switch-panel", () => showSelector());
document.addEventListener("mz:logout", async () => { await signOut(auth); });
document.getElementById("selectAdminBtn").onclick = () => openPanel("admin", true);
document.getElementById("selectSellerBtn").onclick = () => openPanel("seller", true);
document.getElementById("selectLogoutBtn").onclick = async () => { await signOut(auth); };
if (switchPanelBtn) switchPanelBtn.onclick = () => showSelector();

onAuthStateChanged(auth, async user => {
  if (!user) {
    me = null;
    sessionStorage.removeItem("mzmodz_panel");
    showOnly("login");
    if (loginBtn) loginBtn.disabled = false;
    return;
  }

  try {
    me = await fetchMe();
  } catch (error) {
    me = null;
    await signOut(auth);
    loginStatus.textContent = error.code === "NO_ACCESS"
      ? "Akun ini belum memiliki akses panel."
      : "Gagal memuat akun: " + error.message;
    return;
  }
  loginStatus.textContent = "";
  routeAfterLogin();
});


/* =========================
   GENERATE KEY / REVOKE / EXTEND
========================= */
const genDuration = document.getElementById("genDuration");
const genCustomDays = document.getElementById("genCustomDays");
const genMaxDevices = document.getElementById("genMaxDevices");
const genCount = document.getElementById("genCount");
const genBtn = document.getElementById("genBtn");
const genStatus = document.getElementById("genStatus");

if (genDuration) {
  genDuration.onchange = () => {
    genCustomDays.classList.toggle("hidden", genDuration.value !== "custom");
  };
}

if (genBtn) {
  genBtn.onclick = async () => {
    const days = genDuration.value === "custom" ? Number(genCustomDays.value) : Number(genDuration.value);
    genBtn.disabled = true;
    genStatus.textContent = "Membuat key...";
    try {
      const data = await apiRequest({
        method: "POST",
        body: JSON.stringify({
          action: "createKey",
          durationDays: days,
          maxDevices: Number(genMaxDevices.value),
          count: Number(genCount.value)
        })
      });
      genStatus.textContent = "Dibuat: " + data.keys.map(item => item.key).join(", ");
      await load();
      await loadAudit();
    } catch (error) {
      genStatus.textContent = "Gagal: " + error.message;
    } finally {
      genBtn.disabled = false;
    }
  };
}

if (keyTable) {
  keyTable.addEventListener("click", async event => {
    const revokeButton = event.target.closest("[data-revoke]");
    const extendButton = event.target.closest("[data-extend]");
    try {
      if (revokeButton) {
        const key = revokeButton.dataset.revoke;
        if (!confirm(`Revoke key ${key}? Key tidak akan bisa dipakai lagi.`)) return;
        revokeButton.disabled = true;
        await apiRequest({ method: "POST", body: JSON.stringify({ action: "revokeKey", key }) });
        await load();
        await loadAudit();
      } else if (extendButton) {
        const key = extendButton.dataset.extend;
        const input = prompt(`Perpanjang key ${key} berapa hari?`, "1");
        if (input === null) return;
        const addDays = Number(input);
        if (!(addDays > 0)) {
          panelStatus.textContent = "Jumlah hari tidak valid.";
          return;
        }
        extendButton.disabled = true;
        await apiRequest({ method: "POST", body: JSON.stringify({ action: "extendKey", key, addDays }) });
        await load();
        await loadAudit();
      }
    } catch (error) {
      panelStatus.textContent = "Gagal: " + error.message;
    }
  });
}

/* =========================
   AUDIT LOG
========================= */
const auditTable = document.getElementById("auditTable");
const refreshAuditBtn = document.getElementById("refreshAuditBtn");

async function loadAudit() {
  if (!auditTable) return;
  try {
    const data = await apiRequest({
      method: "POST",
      body: JSON.stringify({ action: "listAudit", limit: 100 })
    });
    const logs = Array.isArray(data.logs) ? data.logs : [];
    auditTable.innerHTML = logs.length
      ? logs.map(log => {
          const extra = [log.code, log.reason, log.actor, log.ip, log.meta ? JSON.stringify(log.meta) : ""]
            .filter(Boolean).join(" · ");
          return `<tr>
            <td>${esc(formatDate(log.at))}</td>
            <td>${esc(log.type)}</td>
            <td class="mono">${esc(log.key || log.attempt || "-")}</td>
            <td class="mono">${esc(log.device || "-")}</td>
            <td>${esc(extra || "-")}</td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="5" class="muted">Belum ada log.</td></tr>`;
  } catch (error) {
    auditTable.innerHTML = `<tr><td colspan="5" class="muted">Gagal memuat log: ${esc(error.message)}</td></tr>`;
  }
}

if (refreshAuditBtn) {
  refreshAuditBtn.onclick = () => loadAudit();
}



/* =========================
   USER MANAGEMENT (OWNER)
========================= */
const userTable = document.getElementById("userTable");
const userStatus = document.getElementById("userStatus");
const userEmail = document.getElementById("userEmail");
const userName = document.getElementById("userName");
const userPassword = document.getElementById("userPassword");
const userAdmin = document.getElementById("userAdmin");
const userSeller = document.getElementById("userSeller");
const userActive = document.getElementById("userActive");
const userMaxDays = document.getElementById("userMaxDays");
const userMaxDevices = document.getElementById("userMaxDevices");
const saveUserBtn = document.getElementById("saveUserBtn");
let userCache = [];

async function loadUsers() {
  if (!userTable) return;
  try {
    const data = await apiRequest({ method: "POST", body: JSON.stringify({ action: "listUsers" }) });
    userCache = Array.isArray(data.users) ? data.users : [];
    userTable.innerHTML = userCache.length
      ? userCache.map(user => {
          const access = user.owner
            ? `<span class="badge on perm">OWNER</span>`
            : [user.permissions.admin ? `<span class="badge on perm">ADMIN</span>` : "", user.permissions.seller ? `<span class="badge on perm">SELLER</span>` : ""].join("");
          const uid = esc(user.uid);
          const actions = user.owner
            ? `<span class="muted">PROTECTED</span>`
            : `<button data-user-edit="${uid}">EDIT</button>
               <button data-user-toggle="${uid}" data-active="${user.active ? "1" : "0"}">${user.active ? "DEACTIVATE" : "ACTIVATE"}</button>
               <button class="danger" data-user-delete="${uid}">DELETE</button>`;
          return `<tr>
            <td>${esc(user.email)}</td>
            <td>${esc(user.name || "-")}</td>
            <td>${access}</td>
            <td><span class="badge ${user.active ? "on" : "off"}">${user.active ? "ACTIVE" : "INACTIVE"}</span></td>
            <td>${actions}</td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="5" class="muted">Belum ada user.</td></tr>`;
  } catch (error) {
    userTable.innerHTML = `<tr><td colspan="5" class="muted">Gagal memuat user: ${esc(error.message)}</td></tr>`;
  }
}

if (saveUserBtn) {
  saveUserBtn.onclick = async () => {
    saveUserBtn.disabled = true;
    userStatus.textContent = "Menyimpan...";
    try {
      const limits = {};
      if (Number(userMaxDays.value) > 0) limits.maxDurationDays = Number(userMaxDays.value);
      if (Number(userMaxDevices.value) > 0) limits.maxDevices = Number(userMaxDevices.value);
      const data = await apiRequest({
        method: "POST",
        body: JSON.stringify({
          action: "saveUser",
          email: userEmail.value.trim(),
          name: userName.value.trim(),
          password: userPassword.value,
          permissions: { admin: userAdmin.checked, seller: userSeller.checked },
          active: userActive.checked,
          limits
        })
      });
      userStatus.textContent = data.created ? "User dibuat." : "User diperbarui.";
      userPassword.value = "";
      await loadUsers();
      await loadAudit();
    } catch (error) {
      userStatus.textContent = "Gagal: " + error.message;
    } finally {
      saveUserBtn.disabled = false;
    }
  };
}

if (userTable) {
  userTable.addEventListener("click", async event => {
    const edit = event.target.closest("[data-user-edit]");
    const toggle = event.target.closest("[data-user-toggle]");
    const del = event.target.closest("[data-user-delete]");
    try {
      if (edit) {
        const user = userCache.find(item => item.uid === edit.dataset.userEdit);
        if (!user) return;
        userEmail.value = user.email;
        userName.value = user.name || "";
        userPassword.value = "";
        userAdmin.checked = user.permissions.admin === true;
        userSeller.checked = user.permissions.seller === true;
        userActive.checked = user.active === true;
        userMaxDays.value = user.customLimits?.maxDurationDays || "";
        userMaxDevices.value = user.customLimits?.maxDevices || "";
        userStatus.textContent = "Mengedit " + user.email + ". Klik SAVE USER untuk menyimpan.";
        userEmail.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (toggle) {
        toggle.disabled = true;
        await apiRequest({ method: "POST", body: JSON.stringify({ action: "setUserActive", uid: toggle.dataset.userToggle, active: toggle.dataset.active !== "1" }) });
        await loadUsers();
        await loadAudit();
      } else if (del) {
        if (!confirm("Hapus user ini? Key milik seller tidak ikut terhapus.")) return;
        del.disabled = true;
        await apiRequest({ method: "POST", body: JSON.stringify({ action: "deleteUser", uid: del.dataset.userDelete }) });
        await loadUsers();
        await loadAudit();
      }
    } catch (error) {
      userStatus.textContent = "Gagal: " + error.message;
    }
  });
}

const refreshUsersBtn = document.getElementById("refreshUsersBtn");
if (refreshUsersBtn) refreshUsersBtn.onclick = () => loadUsers();
