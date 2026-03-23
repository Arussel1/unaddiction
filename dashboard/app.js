// ── Firebase config (must match extension's firebase-config.js) ──
// For the mobile dashboard, we hardcode it here.
// REPLACE THESE VALUES with your actual Firebase project info.
const FIREBASE_CONFIG = {
  apiKey:    "YOUR_API_KEY",
  projectId: "YOUR_PROJECT"
};

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

const deviceInput = document.getElementById("deviceInput");
const loadBtn     = document.getElementById("loadBtn");
const dashboard   = document.getElementById("dashboard");
const statusMsg   = document.getElementById("statusMsg");

let currentDeviceId = null;
let refreshTimer    = null;

// ── Check URL for device ID ──
const params = new URLSearchParams(window.location.search);
const urlId  = params.get("id") || window.location.pathname.split("/view/")[1];
if (urlId) {
  deviceInput.value = urlId;
  loadDashboard(urlId);
}

// ── Load ──
loadBtn.addEventListener("click", () => {
  const id = deviceInput.value.trim();
  if (!id) return;
  loadDashboard(id);
});

deviceInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadBtn.click();
});

async function loadDashboard(deviceId) {
  currentDeviceId = deviceId;
  statusMsg.textContent = "Loading…";
  statusMsg.className = "status-msg";
  dashboard.classList.remove("visible");

  try {
    const res = await fetch(
      `${FIRESTORE_BASE}/debts/${deviceId}?key=${FIREBASE_CONFIG.apiKey}`
    );

    if (res.status === 404) {
      statusMsg.textContent = "Device not found. Check the ID and try again.";
      statusMsg.className = "status-msg error";
      return;
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const doc = await res.json();
    const data = parseDoc(doc);
    renderDashboard(data);

    statusMsg.textContent = "";
    dashboard.classList.add("visible");

    // Auto-refresh
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => refreshData(deviceId), 30000);

  } catch (err) {
    statusMsg.textContent = `Error: ${err.message}`;
    statusMsg.className = "status-msg error";
  }
}

async function refreshData(deviceId) {
  try {
    const res = await fetch(
      `${FIRESTORE_BASE}/debts/${deviceId}?key=${FIREBASE_CONFIG.apiKey}`
    );
    if (!res.ok) return;
    const doc = await res.json();
    renderDashboard(parseDoc(doc));
  } catch { /* silent */ }
}

function parseDoc(doc) {
  const f = doc.fields || {};
  return {
    totalFine:        Number(f.totalFine?.integerValue ?? f.totalFine?.doubleValue ?? 0),
    violationCount:   Number(f.violationCount?.integerValue ?? f.violationCount?.doubleValue ?? 0),
    monthlyAllowance: Number(f.monthlyAllowance?.integerValue ?? f.monthlyAllowance?.doubleValue ?? 50),
    lastViolation:    f.lastViolation?.timestampValue ?? null
  };
}

function renderDashboard(data) {
  const remaining = data.monthlyAllowance - data.totalFine;
  const budgetBig = document.getElementById("budgetBig");

  budgetBig.textContent = `$${remaining} CAD`;
  budgetBig.className = "budget-big";
  if (remaining > data.monthlyAllowance * 0.5) budgetBig.classList.add("positive");
  else if (remaining > 0) budgetBig.classList.add("warning");
  else budgetBig.classList.add("negative");

  document.getElementById("budgetDetail").textContent =
    `$${data.monthlyAllowance} allowance − $${data.totalFine} fined`;

  document.getElementById("dViolations").textContent = data.violationCount;
  document.getElementById("dFined").textContent = `$${data.totalFine}`;

  const updateEl = document.getElementById("lastUpdate");
  if (data.lastViolation && data.violationCount > 0) {
    const d = new Date(data.lastViolation);
    updateEl.textContent = `Last violation: ${d.toLocaleString()}`;
  } else {
    updateEl.textContent = "No violations this month 🎉";
  }
}
