// ═══════════════════════════════════════════════════════════
//  background.js — SocialFine Service Worker / Event Page
//  Works in both Chrome (Service Worker) and Firefox
//  Developer Edition (Event Page) via Manifest V3.
//  Detects blacklisted domain visits, increments Firestore
//  fine counter, handles monthly reset, time-based
//  allowances, dynamic blacklist management, and offline
//  caching.
// ═══════════════════════════════════════════════════════════

// Cross-browser compatibility: Firefox MV3 supports chrome.*
// namespace natively, but this guard ensures robustness.
if (typeof globalThis.chrome === "undefined" && typeof globalThis.browser !== "undefined") {
  globalThis.chrome = globalThis.browser;
}

import FIREBASE_CONFIG from "./firebase-config.js";

// ── Defaults ─────────────────────────────────────────────
const DEFAULT_BLACKLIST = [
  "reddit.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com"
];

const DEFAULT_ALLOWANCE       = 50;  // $50 CAD monthly budget
const FINE_AMOUNT             = 1;   // $1 CAD per violation
const DEFAULT_DAILY_FREE_MINS = 5;   // 5 min free browsing per day
const RULE_ID_OFFSET          = 1000; // dynamic rule IDs start here

// ═══════════════════════════════════════════════════════════
//  FIRESTORE REST HELPERS
// ═══════════════════════════════════════════════════════════

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

async function firestoreGet(deviceId) {
  try {
    const res = await fetch(`${FIRESTORE_BASE}/debts/${deviceId}?key=${FIREBASE_CONFIG.apiKey}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Firestore GET ${res.status}`);
    const data = parseFirestoreDoc(await res.json());
    console.log(`[SocialFine] Firestore success: data retrieved for ${deviceId}`);
    return data;
  } catch (err) {
    console.error("[SocialFine] Firestore GET failed:", err);
    return null;
  }
}

async function firestoreSet(deviceId, data) {
  try {
    const res = await fetch(
      `${FIRESTORE_BASE}/debts/${deviceId}?key=${FIREBASE_CONFIG.apiKey}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildFirestoreDoc(data))
      }
    );
    if (!res.ok) throw new Error(`Firestore PATCH ${res.status}`);
    console.log(`[SocialFine] Firestore success: debt synced for ${deviceId}`);
    return true;
  } catch (err) {
    console.error("[SocialFine] Firestore SET failed:", err);
    return false;
  }
}

function parseFirestoreDoc(doc) {
  const f = doc.fields || {};
  return {
    totalFine:        Number(f.totalFine?.integerValue        ?? f.totalFine?.doubleValue        ?? 0),
    violationCount:   Number(f.violationCount?.integerValue   ?? f.violationCount?.doubleValue   ?? 0),
    monthlyAllowance: Number(f.monthlyAllowance?.integerValue ?? f.monthlyAllowance?.doubleValue ?? DEFAULT_ALLOWANCE),
    lastViolation:    f.lastViolation?.timestampValue          ?? null,
    lastResetMonth:   f.lastResetMonth?.stringValue            ?? null
  };
}

function buildFirestoreDoc(data) {
  return {
    fields: {
      totalFine:        { integerValue: String(data.totalFine) },
      violationCount:   { integerValue: String(data.violationCount) },
      monthlyAllowance: { integerValue: String(data.monthlyAllowance) },
      lastViolation:    { timestampValue: data.lastViolation },
      lastResetMonth:   { stringValue: data.lastResetMonth }
    }
  };
}

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentDayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ═══════════════════════════════════════════════════════════
//  DEVICE ID
// ═══════════════════════════════════════════════════════════

async function getOrCreateDeviceId() {
  const result = await chrome.storage.local.get("deviceId");
  if (result.deviceId) return result.deviceId;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ deviceId: id });
  return id;
}

// ═══════════════════════════════════════════════════════════
//  BLACKLIST MANAGEMENT (Dynamic Rules)
// ═══════════════════════════════════════════════════════════

async function getBlacklist() {
  const { blacklist } = await chrome.storage.local.get("blacklist");
  return blacklist || DEFAULT_BLACKLIST;
}

async function setBlacklist(domains) {
  await chrome.storage.local.set({ blacklist: domains });
  await syncDynamicRules(domains);
}

async function syncDynamicRules(domains, forceEnable = false) {
  // Remove all existing dynamic rules
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map(r => r.id);

  let addRules = [];
  
  // Only add rules if free time is exhausted
  const tt = await getTimeTracking();
  if (isFreeTimeExhausted(tt) || forceEnable) {
    addRules = domains.map((domain, i) => ({
      id: RULE_ID_OFFSET + i,
      priority: 1,
      action: {
        type: "redirect",
        redirect: { extensionPath: "/blocked.html" }
      },
      condition: {
        urlFilter: `||${domain}`,
        resourceTypes: ["main_frame"]
      }
    }));
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules
  });

  console.log(`[SocialFine] Synced ${addRules.length} dynamic blocking rules.`);
}

// ═══════════════════════════════════════════════════════════
//  DEBT RECORD
// ═══════════════════════════════════════════════════════════

async function getDebtRecord(deviceId) {
  const cloud = await firestoreGet(deviceId);
  if (cloud) {
    await chrome.storage.local.set({ debt: cloud });
    return cloud;
  }
  const local = await chrome.storage.local.get("debt");
  if (local.debt) return local.debt;

  const fresh = {
    totalFine: 0,
    violationCount: 0,
    monthlyAllowance: DEFAULT_ALLOWANCE,
    lastViolation: new Date().toISOString(),
    lastResetMonth: currentMonthKey()
  };
  await chrome.storage.local.set({ debt: fresh });
  return fresh;
}

function maybeResetForNewMonth(record) {
  const month = currentMonthKey();
  if (record.lastResetMonth !== month) {
    record.totalFine = 0;
    record.violationCount = 0;
    record.lastResetMonth = month;
  }
  return record;
}

// ═══════════════════════════════════════════════════════════
//  TIME-BASED ALLOWANCE
//  Track seconds spent on blacklisted domains per day.
//  Fine only triggers after daily free minutes are used up.
// ═══════════════════════════════════════════════════════════

async function getTimeTracking() {
  const { timeTracking } = await chrome.storage.local.get("timeTracking");
  const today = currentDayKey();

  if (!timeTracking || timeTracking.day !== today) {
    // New day — reset
    const fresh = {
      day: today,
      secondsSpent: 0,
      dailyFreeMinutes: timeTracking?.dailyFreeMinutes ?? DEFAULT_DAILY_FREE_MINS,
      activeTabId: null,
      lastTick: null
    };
    await chrome.storage.local.set({ timeTracking: fresh });
    return fresh;
  }
  return timeTracking;
}

async function saveTimeTracking(tt) {
  await chrome.storage.local.set({ timeTracking: tt });
}

/**
 * Returns true if the user has exceeded their daily free time.
 */
function isFreeTimeExhausted(tt) {
  return tt.secondsSpent >= tt.dailyFreeMinutes * 60;
}

// ── Active-tab time tracking ─────────────────────────────
// We use an alarm that ticks every 15 seconds to accumulate
// time when the active tab is on a blacklisted domain.

async function tickTimeTracker() {
  const tt = await getTimeTracking();
  if (!tt.activeTabId || !tt.lastTick) return;

  const now = Date.now();
  const elapsed = Math.round((now - tt.lastTick) / 1000);
  
  const wasExhausted = isFreeTimeExhausted(tt);
  tt.secondsSpent += elapsed;
  tt.lastTick = now;
  await saveTimeTracking(tt);

  if (!wasExhausted && isFreeTimeExhausted(tt)) {
    console.log("[SocialFine] Free time exhausted! Enabling block rules.");
    await recordViolation();
    const blacklist = await getBlacklist();
    await syncDynamicRules(blacklist);
    chrome.tabs.update(tt.activeTabId, { url: "/blocked.html" });
  }
}


async function startTrackingTab(tabId) {
  const tt = await getTimeTracking();
  tt.activeTabId = tabId;
  tt.lastTick = Date.now();
  await saveTimeTracking(tt);
}

async function stopTrackingTab() {
  const tt = await getTimeTracking();
  if (tt.lastTick) {
    const elapsed = Math.round((Date.now() - tt.lastTick) / 1000);
    tt.secondsSpent += elapsed;
  }
  tt.activeTabId = null;
  tt.lastTick = null;
  await saveTimeTracking(tt);
}

// ═══════════════════════════════════════════════════════════
//  VIOLATION RECORDING
// ═══════════════════════════════════════════════════════════

async function recordViolation() {
  const deviceId = await getOrCreateDeviceId();
  let record = await getDebtRecord(deviceId);
  record = maybeResetForNewMonth(record);

  record.totalFine += FINE_AMOUNT;
  record.violationCount += 1;
  record.lastViolation = new Date().toISOString();

  await chrome.storage.local.set({ debt: record });

  const synced = await firestoreSet(deviceId, record);
  if (!synced) {
    await chrome.storage.local.set({ pendingSync: true });
  }
  return record;
}

async function retrySync() {
  const { pendingSync } = await chrome.storage.local.get("pendingSync");
  if (!pendingSync) return;
  const deviceId = await getOrCreateDeviceId();
  const { debt } = await chrome.storage.local.get("debt");
  if (!debt) return;
  const synced = await firestoreSet(deviceId, debt);
  if (synced) {
    await chrome.storage.local.remove("pendingSync");
    console.log("[SocialFine] Pending sync completed.");
  }
}

// ═══════════════════════════════════════════════════════════
//  URL MATCHING (uses dynamic blacklist)
// ═══════════════════════════════════════════════════════════

async function isBlacklisted(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const blacklist = await getBlacklist();
    return blacklist.some(domain =>
      hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
//  TAB LISTENER
//  When a blacklisted domain is detected:
//  - If daily free time remains → allow (no fine, track time)
//  - If free time exhausted → fine + redirect
// ═══════════════════════════════════════════════════════════

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "loading" || !tab.url) return;
  if (!(await isBlacklisted(tab.url))) return;

  const tt = await getTimeTracking();

  if (!isFreeTimeExhausted(tt)) {
    // Still in free-browse window — start tracking time, no fine
    console.log(`[SocialFine] Free browse: ${tab.url} (${Math.round(tt.secondsSpent / 60)}/${tt.dailyFreeMinutes} min used)`);
    await startTrackingTab(tabId);
    return; // allow the page to load
  }

  // Free time exhausted — record violation
  console.log(`[SocialFine] Violation detected (free time used): ${tab.url}`);
  const record = await recordViolation();
  const remaining = record.monthlyAllowance - record.totalFine;
  console.log(`[SocialFine] Budget remaining: $${remaining} CAD`);
});

// Track when user leaves a blacklisted tab
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url && (await isBlacklisted(tab.url))) {
      await startTrackingTab(tabId);
    } else {
      await stopTrackingTab();
    }
  } catch { /* tab may have closed */ }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await stopTrackingTab();
  }
});

// ═══════════════════════════════════════════════════════════
//  ON INSTALL / STARTUP
// ═══════════════════════════════════════════════════════════

chrome.runtime.onInstalled.addListener(async () => {
  const deviceId = await getOrCreateDeviceId();
  console.log(`[SocialFine] Installed. Device ID: ${deviceId}`);

  // Initialise cloud record if new
  const existing = await firestoreGet(deviceId);
  if (!existing) {
    const fresh = {
      totalFine: 0,
      violationCount: 0,
      monthlyAllowance: DEFAULT_ALLOWANCE,
      lastViolation: new Date().toISOString(),
      lastResetMonth: currentMonthKey()
    };
    await firestoreSet(deviceId, fresh);
    await chrome.storage.local.set({ debt: fresh });
  }

  // Set up dynamic rules from blacklist
  const blacklist = await getBlacklist();
  await syncDynamicRules(blacklist);
});

chrome.runtime.onStartup.addListener(async () => {
  const deviceId = await getOrCreateDeviceId();
  let record = await getDebtRecord(deviceId);
  record = maybeResetForNewMonth(record);
  await chrome.storage.local.set({ debt: record });
  await firestoreSet(deviceId, record);
  await retrySync();

  // Re-sync dynamic rules
  const blacklist = await getBlacklist();
  await syncDynamicRules(blacklist);
});

// ═══════════════════════════════════════════════════════════
//  ALARMS
// ═══════════════════════════════════════════════════════════

chrome.alarms.create("syncRetry", { periodInMinutes: 5 });
chrome.alarms.create("timeTick", { periodInMinutes: 0.25 }); // 15s ticks

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "syncRetry") await retrySync();
  if (alarm.name === "timeTick")  await tickTimeTracker();
});

// ═══════════════════════════════════════════════════════════
//  MESSAGE HANDLER (popup ↔ background)
// ═══════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

  // ── Get full status ────────────────────────────
  if (message.type === "GET_STATUS") {
    (async () => {
      const deviceId = await getOrCreateDeviceId();
      let record = await getDebtRecord(deviceId);
      record = maybeResetForNewMonth(record);
      const tt = await getTimeTracking();
      const blacklist = await getBlacklist();
      sendResponse({
        deviceId,
        ...record,
        timeTracking: tt,
        blacklist
      });
    })();
    return true;
  }

  // ── Record Violation (from blocked.html) ───────
  if (message.type === "RECORD_VIOLATION") {
    (async () => {
      const record = await recordViolation();
      sendResponse({ success: true, ...record });
    })();
    return true;
  }

  // ── Reset fine ─────────────────────────────────
  if (message.type === "RESET_FINE") {
    (async () => {
      const deviceId = await getOrCreateDeviceId();
      let record = await getDebtRecord(deviceId);
      record.totalFine = 0;
      record.violationCount = 0;
      record.lastViolation = new Date().toISOString();
      await chrome.storage.local.set({ debt: record });
      await firestoreSet(deviceId, record);
      sendResponse({ success: true, ...record });
    })();
    return true;
  }

  // ── Set monthly allowance ──────────────────────
  if (message.type === "SET_ALLOWANCE") {
    (async () => {
      const deviceId = await getOrCreateDeviceId();
      let record = await getDebtRecord(deviceId);
      record.monthlyAllowance = Number(message.value) || DEFAULT_ALLOWANCE;
      await chrome.storage.local.set({ debt: record });
      await firestoreSet(deviceId, record);
      sendResponse({ success: true, ...record });
    })();
    return true;
  }

  // ── Set daily free minutes ─────────────────────
  if (message.type === "SET_FREE_MINUTES") {
    (async () => {
      const tt = await getTimeTracking();
      tt.dailyFreeMinutes = Number(message.value) || 0; // allow 0 explicitly
      await saveTimeTracking(tt);
      
      const blacklist = await getBlacklist();
      await syncDynamicRules(blacklist);
      
      sendResponse({ success: true, timeTracking: tt });
    })();
    return true;
  }

  // ── Get blacklist ──────────────────────────────
  if (message.type === "GET_BLACKLIST") {
    (async () => {
      const blacklist = await getBlacklist();
      sendResponse({ blacklist });
    })();
    return true;
  }

  // ── Add domain to blacklist ────────────────────
  if (message.type === "ADD_DOMAIN") {
    (async () => {
      const blacklist = await getBlacklist();
      const domain = message.domain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/.*$/, "");
      if (!blacklist.includes(domain)) {
        blacklist.push(domain);
        await setBlacklist(blacklist);
      }
      sendResponse({ success: true, blacklist });
    })();
    return true;
  }

  // ── Remove domain from blacklist ───────────────
  if (message.type === "REMOVE_DOMAIN") {
    (async () => {
      let blacklist = await getBlacklist();
      blacklist = blacklist.filter(d => d !== message.domain);
      await setBlacklist(blacklist);
      sendResponse({ success: true, blacklist });
    })();
    return true;
  }
});

// ═══════════════════════════════════════════════════════════
//  EXPORTS (for unit testing — ignored in Chrome runtime)
// ═══════════════════════════════════════════════════════════
export {
  maybeResetForNewMonth,
  currentMonthKey,
  currentDayKey,
  isFreeTimeExhausted,
  parseFirestoreDoc,
  buildFirestoreDoc,
  DEFAULT_ALLOWANCE,
  DEFAULT_DAILY_FREE_MINS,
  FINE_AMOUNT
};
