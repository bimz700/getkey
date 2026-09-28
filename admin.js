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
              <b>Device:</b> ${esc(claim.device)}<br>
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
        <td class="key">${k}<span class="badge src">${esc(String(key.source || "legacy").toUpperCase())}</span></td>
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

onAuthStateChanged(
  auth,
  user => {

    if (!user) {

      loginCard.classList.remove(
        "hidden"
      );

      panel.classList.add(
        "hidden"
      );

      return;

    }


    loginCard.classList.add(
      "hidden"
    );

    panel.classList.remove(
      "hidden"
    );


    if (adminEmail) {

      adminEmail.textContent =
        user.email || "";

    }


    load();

  }
);


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

onAuthStateChanged(auth, user => {
  if (user) loadAudit();
});
