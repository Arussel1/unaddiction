// 1. Tell background script to record the violation since declarativeNetRequest intercepted it
// Use try/catch because permissions might differ or it might be a standalone page for some reason
try {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: "RECORD_VIOLATION" });
  }
} catch (e) {
  console.error("Could not record violation", e);
}

// 2. Handle the redirect button
const isFirefox = typeof browser !== 'undefined';
const redirectBtn = document.getElementById('redirectBtn');

// Prevent default <a> link behavior and use API-based navigation
redirectBtn.addEventListener('click', (e) => {
  e.preventDefault();
  
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    if (isFirefox) {
      // In Firefox, updating a tab to an about: URL often throws an Illegal URL error.
      // Instead, we create a new tab at about:home and close the blocked one.
      chrome.tabs.create({ url: "about:home" }).then(() => {
        chrome.tabs.getCurrent(tab => { if (tab) chrome.tabs.remove(tab.id); });
      }).catch((err) => {
        console.error("Fallback due to Illegal URL:", err);
        chrome.tabs.create({}).then(() => {
          chrome.tabs.getCurrent(tab => { if (tab) chrome.tabs.remove(tab.id); });
        });
      });
    } else {
      chrome.tabs.update({ url: "https://www.google.com" });
    }
  } else {
    window.location.href = isFirefox ? "about:home" : "https://www.google.com";
  }
});
