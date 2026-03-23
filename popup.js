// ═══════════════════════════════════════════════════════════
//  popup.js — SocialFine Popup Controller
//  Communicates with background.js to display status,
//  manage blacklist, generate QR code, and configure
//  allowance + time settings.
// ═══════════════════════════════════════════════════════════

const $ = (sel) => document.querySelector(sel);

// ── Elements ─────────────────────────────────────────────
const monthLabel       = $("#monthLabel");
const budgetCard       = $("#budgetCard");
const budgetValue      = $("#budgetValue");
const budgetSubtext    = $("#budgetSubtext");
const violationCount   = $("#violationCount");
const totalFineEl      = $("#totalFine");
const allowanceDisplay = $("#allowanceDisplay");
const lastViolationEl  = $("#lastViolation");
const deviceIdEl       = $("#deviceId");
const copyBtn          = $("#copyBtn");
const resetBtn         = $("#resetBtn");
const saveAllowance    = $("#saveAllowance");
const allowanceInput   = $("#allowanceInput");
const timeBar          = $("#timeBar");
const timeLabel        = $("#timeLabel");
const qrCanvas         = $("#qrCanvas");
const blacklistList    = $("#blacklistList");
const addDomainInput   = $("#addDomainInput");
const addDomainBtn     = $("#addDomainBtn");
const saveFreeMinutes  = $("#saveFreeMinutes");
const freeMinutesInput = $("#freeMinutesInput");

// ── Constants ────────────────────────────────────────────
// REPLACE with your actual dashboard URL when hosted
const DASHBOARD_BASE_URL = "https://socialfine.web.app/view/";

// ── Month label ──────────────────────────────────────────
function setMonthLabel() {
  const now = new Date();
  monthLabel.textContent = now.toLocaleString("default", { month: "long", year: "numeric" });
}

// ── Render status ────────────────────────────────────────
function render(data) {
  const allowance = data.monthlyAllowance || 50;
  const fine      = data.totalFine || 0;
  const remaining = allowance - fine;

  // Budget value
  budgetValue.textContent = `$${remaining} CAD`;
  budgetValue.className = "budget-value";
  budgetCard.classList.remove("danger");
  if (remaining > allowance * 0.5) {
    budgetValue.classList.add("positive");
  } else if (remaining > 0) {
    budgetValue.classList.add("warning");
  } else {
    budgetValue.classList.add("negative");
    budgetCard.classList.add("danger");
  }

  budgetSubtext.textContent = `$${allowance} allowance − $${fine} fined`;

  // Stats
  violationCount.textContent = data.violationCount || 0;
  totalFineEl.textContent = `$${fine}`;
  allowanceDisplay.textContent = `$${allowance}`;

  // Last violation
  if (data.lastViolation && data.violationCount > 0) {
    const d = new Date(data.lastViolation);
    lastViolationEl.textContent = `Last violation: ${d.toLocaleString()}`;
  } else {
    lastViolationEl.textContent = "No violations yet 🎉";
  }

  // Device ID
  if (data.deviceId) {
    deviceIdEl.textContent = data.deviceId;
    renderQR(data.deviceId);
  }

  // Settings placeholders
  allowanceInput.placeholder = String(allowance);

  // Time tracker
  if (data.timeTracking) {
    renderTimeTracker(data.timeTracking);
  }

  // Blacklist
  if (data.blacklist) {
    renderBlacklist(data.blacklist);
  }
}

// ── Time tracker bar ─────────────────────────────────────
function renderTimeTracker(tt) {
  const totalSeconds = tt.dailyFreeMinutes * 60;
  const spent = Math.min(tt.secondsSpent, totalSeconds);
  const pct = totalSeconds > 0 ? (spent / totalSeconds) * 100 : 100;
  const minsUsed = Math.round(spent / 60);

  timeBar.style.width = `${pct}%`;
  timeBar.className = "time-bar";
  if (pct >= 100) timeBar.classList.add("exhausted");
  else if (pct >= 75) timeBar.classList.add("near");

  timeLabel.textContent = `${minsUsed} / ${tt.dailyFreeMinutes} min free today`;
  freeMinutesInput.placeholder = String(tt.dailyFreeMinutes);
}

// ── QR Code ──────────────────────────────────────────────
let qrInstance = null;
function renderQR(deviceId) {
  if (typeof QRCode === "undefined") return;
  const url = DASHBOARD_BASE_URL + deviceId;
  const container = document.getElementById("qrContainer");

  // Replace canvas with a div for qrcodejs
  const qrEl = document.createElement("div");
  qrEl.id = "qrTarget";

  // Remove any previous QR
  const old = document.getElementById("qrTarget");
  if (old) old.remove();
  const canvas = document.getElementById("qrCanvas");
  if (canvas) canvas.style.display = "none";

  container.insertBefore(qrEl, container.firstChild);

  qrInstance = new QRCode(qrEl, {
    text: url,
    width: 120,
    height: 120,
    colorDark: "#667eea",
    colorLight: "#0d0d1a",
    correctLevel: QRCode.CorrectLevel.M
  });
}

// ── Blacklist renderer ───────────────────────────────────
function renderBlacklist(domains) {
  blacklistList.innerHTML = "";
  domains.forEach(domain => {
    const item = document.createElement("div");
    item.className = "blacklist-item";

    const label = document.createElement("span");
    label.className = "blacklist-domain";
    label.textContent = domain;

    const removeBtn = document.createElement("button");
    removeBtn.className = "blacklist-remove";
    removeBtn.textContent = "✕";
    removeBtn.title = `Remove ${domain}`;
    removeBtn.addEventListener("click", () => removeDomain(domain));

    item.appendChild(label);
    item.appendChild(removeBtn);
    blacklistList.appendChild(item);
  });
}

function removeDomain(domain) {
  chrome.runtime.sendMessage({ type: "REMOVE_DOMAIN", domain }, (res) => {
    if (res?.success) {
      showToast(`Removed ${domain}`);
      renderBlacklist(res.blacklist);
    }
  });
}

// ── Toast helper ─────────────────────────────────────────
function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
setMonthLabel();

chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
  if (response) render(response);
});

// ── Copy Device ID ───────────────────────────────────────
copyBtn.addEventListener("click", () => {
  const id = deviceIdEl.textContent;
  if (id && id !== "—") {
    navigator.clipboard.writeText(id).then(() => showToast("Copied!"));
  }
});

// ── Reset Fine ───────────────────────────────────────────
resetBtn.addEventListener("click", () => {
  if (!confirm("Reset your fine to $0? (This means you've paid up!)")) return;
  chrome.runtime.sendMessage({ type: "RESET_FINE" }, (response) => {
    if (response?.success) {
      showToast("Fine reset! Fresh start 🎉");
      chrome.runtime.sendMessage({ type: "GET_STATUS" }, render);
    }
  });
});

// ── Save Allowance ───────────────────────────────────────
saveAllowance.addEventListener("click", () => {
  const val = parseInt(allowanceInput.value, 10);
  if (!val || val < 1) { showToast("Enter a valid amount"); return; }
  chrome.runtime.sendMessage({ type: "SET_ALLOWANCE", value: val }, (res) => {
    if (res?.success) {
      showToast(`Allowance set to $${val} CAD`);
      allowanceInput.value = "";
      chrome.runtime.sendMessage({ type: "GET_STATUS" }, render);
    }
  });
});

// ── Save Free Minutes ────────────────────────────────────
saveFreeMinutes.addEventListener("click", () => {
  const val = parseInt(freeMinutesInput.value, 10);
  if (val == null || val < 0) { showToast("Enter a valid number"); return; }
  chrome.runtime.sendMessage({ type: "SET_FREE_MINUTES", value: val }, (res) => {
    if (res?.success) {
      showToast(`Free time set to ${val} min/day`);
      freeMinutesInput.value = "";
      chrome.runtime.sendMessage({ type: "GET_STATUS" }, render);
    }
  });
});

// ── Add Domain ───────────────────────────────────────────
addDomainBtn.addEventListener("click", () => {
  const domain = addDomainInput.value.trim();
  if (!domain) { showToast("Enter a domain"); return; }
  chrome.runtime.sendMessage({ type: "ADD_DOMAIN", domain }, (res) => {
    if (res?.success) {
      showToast(`Added ${domain}`);
      addDomainInput.value = "";
      renderBlacklist(res.blacklist);
    }
  });
});

addDomainInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addDomainBtn.click();
});
