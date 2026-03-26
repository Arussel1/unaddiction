# SocialFine — Productivity Punisher

Curb social media addiction by imposing a **$1 CAD fine** from your monthly budget every time you visit a blacklisted domain.

## Features

- **Dynamic Domain Blocking** — Manage your blacklist from the popup (add/remove sites)
- **Budget Tracking** — Displays `Remaining Budget: (Allowance − Fine) CAD`
- **Monthly Reset** — Fine resets on the 1st of every month
- **Time-Based Allowance** — 5 minutes of free browsing per day before fines kick in
- **Local Storage** — Your budget and fines are stored securely on your browser.
- **No PII** — Only violation count is stored, no browsing history

## Setup

### 1. Firefox Developer Edition (PC)

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…** → select `manifest.json`
3. Click the SocialFine icon in the toolbar to:
   - Set your monthly allowance
   - Configure daily free browsing minutes
   - Add/remove blocked domains

> **Tip:** For permanent installation, package the extension as an `.xpi` file and sign it through [AMO](https://addons.mozilla.org/).



### 4. Run Tests

```bash
npm test
```

## Structure

```
unaddiction/
├── manifest.json         # Chrome MV3 manifest
├── background.js         # Service worker logic

├── net_rules.json        # Static fallback rules
├── blocked.html          # "You Got Fined" redirect page
├── popup.html            # Extension popup
├── popup.css             # Popup styles
├── popup.js              # Popup controller

├── tests/
│   └── background.test.js
├── package.json
└── jest.config.js
```



## Architecture
