import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import firebaseConfig from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const loginCard = document.getElementById("loginCard");
const panel = document.getElementById("panel");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const loginStatus = document.getElementById("loginStatus");
const adminEmail = document.getElementById("adminEmail");
const logoutBtn = document.getElementById("logoutBtn");
const countInput = document.getElementById("count");
const generateBtn = document.getElementById("generateBtn");
const panelStatus = document.getElementById("panelStatus");
const keyTable = document.getElementById("keyTable");

async function apiRequest(options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("NOT_AUTHENTICATED");

  const token = await user.getIdToken();
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    Authorization: `Bearer ${token}`
  };

  const response = await fetch("/api/admin", {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
    cache: "no-store"
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
  return data;
}

async function loadKeys() {
  panelStatus.textContent = "Loading keys...";
  try {
    const data = await apiRequest({ method: "GET" });
    renderKeys(data.keys || []);
    panelStatus.textContent = `${(data.keys || []).length} key ditampilkan.`;
  } catch (error) {
    console.error(error);
    panelStatus.textContent = error.message;
  }
}

function renderKeys(keys) {
  keyTable.innerHTML = "";

  for (const item of keys) {
    const tr = document.createElement("tr");
    const disabled = item.status === "disabled";

    tr.innerHTML = `
      <td class="key">${escapeHtml(item.key)}</td>
      <td><span class="badge">${escapeHtml(item.status)}</span></td>
      <td>
        <button class="actionBtn copy" data-copy="${escapeHtml(item.key)}">COPY</button>
        <button class="actionBtn ${disabled ? "enable" : "disable"}" data-action="${disabled ? "enable" : "disable"}" data-key="${escapeHtml(item.key)}">
          ${disabled ? "ENABLE" : "DISABLE"}
        </button>
      </td>
    `;

    keyTable.appendChild(tr);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

loginBtn.addEventListener("click", async () => {
  loginBtn.disabled = true;
  loginStatus.textContent = "Logging in...";

  try {
    await signInWithEmailAndPassword(
      auth,
      emailInput.value.trim(),
      passwordInput.value
    );
    loginStatus.textContent = "Login berhasil.";
  } catch (error) {
    console.error(error);
    loginStatus.textContent = "Login gagal. Cek email/password.";
    loginBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

generateBtn.addEventListener("click", async () => {
  const count = Math.max(1, Math.min(100, Number(countInput.value) || 1));
  generateBtn.disabled = true;
  panelStatus.textContent = "Generating...";

  try {
    const data = await apiRequest({
      method: "POST",
      body: JSON.stringify({ action: "generate", count })
    });
    panelStatus.textContent = `${data.generated.length} key berhasil dibuat.`;
    await loadKeys();
  } catch (error) {
    console.error(error);
    panelStatus.textContent = error.message;
  } finally {
    generateBtn.disabled = false;
  }
});

keyTable.addEventListener("click", async (event) => {
  const copy = event.target.closest("[data-copy]");
  if (copy) {
    await navigator.clipboard.writeText(copy.dataset.copy);
    panelStatus.textContent = "Key disalin.";
    return;
  }

  const action = event.target.closest("[data-action]");
  if (!action) return;

  action.disabled = true;
  try {
    await apiRequest({
      method: "POST",
      body: JSON.stringify({
        action: "setStatus",
        key: action.dataset.key,
        status: action.dataset.action === "disable" ? "disabled" : "active"
      })
    });
    await loadKeys();
  } catch (error) {
    console.error(error);
    panelStatus.textContent = error.message;
    action.disabled = false;
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    loginCard.classList.remove("hidden");
    panel.classList.add("hidden");
    adminEmail.textContent = "";
    return;
  }

  loginCard.classList.add("hidden");
  panel.classList.remove("hidden");
  adminEmail.textContent = user.email || "";
  await loadKeys();
});
