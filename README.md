# SocialFine — Productivity Punisher

Curb social media addiction by imposing a **$1 CAD fine** from your monthly budget every time you visit a blacklisted domain.

## Features

- **Dynamic Domain Blocking** — Manage your blacklist from the popup (add/remove sites)
- **Budget Tracking** — Displays `Remaining Budget: (Allowance − Fine) CAD`
- **Monthly Reset** — Fine resets on the 1st of every month
- **Time-Based Allowance** — 5 minutes of free browsing per day before fines kick in
- **Cross-Device Sync** — Firebase Firestore keeps your debt in sync across devices
- **Offline-First** — Fines cached locally and synced when back online
- **QR Code Dashboard** — Scan a QR code in the popup to view your debt on mobile (iOS Chrome)
- **No PII** — Only violation count is stored, no browsing history

## Setup

### 1. Firebase & Environment

1. Create a project at [Firebase Console](https://console.firebase.google.com/)
2. Enable **Cloud Firestore** (start in test mode)
3. Copy your project credentials into a `.env` file (see `.env.example` for the required keys).
4. Run the setup script to generate the extension's config:
   ```bash
   npm install
   npm run setup-auth
   ```
   *Note: You also need to manually paste these values into `dashboard/index.html` (for the mobile dashboard).*

### 2. Firefox Developer Edition (PC)

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…** → select `manifest.json`
3. Click the SocialFine icon in the toolbar to:
   - Set your monthly allowance
   - Configure daily free browsing minutes
   - Add/remove blocked domains

> **Tip:** For permanent installation, package the extension as an `.xpi` file and sign it through [AMO](https://addons.mozilla.org/).

### 3. Chrome iOS (Mobile Dashboard)

Host `dashboard/` anywhere (GitHub Pages, Firebase Hosting, etc.) or open `dashboard/index.html` locally. Enter your Device ID (or scan the QR code in the Firefox popup) to view your debt on your phone.

### 4. Run Tests

```bash
npm test
```

## Structure

```
unaddiction/
├── manifest.json         # Chrome MV3 manifest
├── background.js         # Service worker logic
├── .env                  # Secrets (gitignored)
├── .env.example          # Secrets template
├── config-gen.js         # Script to generate firebase-config.js
├── firebase-config.js    # Generated config (gitignored)
├── net_rules.json        # Static fallback rules
├── blocked.html          # "You Got Fined" redirect page
├── popup.html            # Extension popup
├── popup.css             # Popup styles
├── popup.js              # Popup controller
├── lib/
│   └── qrcode.min.js     # QR code library
├── icons/
│   ├── icon16.png
│   └── ...
├── dashboard/
│   └── index.html        # Web dashboard
├── tests/
│   └── background.test.js
├── package.json
└── jest.config.js
```

---

## 🛠 Firefox Reviewer Instructions

This extension requires a build step to generate the Firebase configuration from environment variables.

### Build Environment
- **OS**: Linux (WSL/Ubuntu supported) or macOS.
- **Node.js**: v18.0.0 or higher.
- **npm**: v9.0.0 or higher.

### Reproducing the Build
To generate an exact copy of the `.xpi` file:

1.  **Clone/Extract** the source code.
2.  **Environment Setup**: Create a `.env` file in the root using `.env.example` as a template (dummy values can be used for the build to succeed).
3.  **Install dependencies**: 
    ```bash
    npm install
    ```
4.  **Generate Config**:
    ```bash
    npm run setup-auth
    ```
5.  **Build .xpi**:
    ```bash
    npm run build
    ```

The resulting `socialfine.xpi` in the root directory will match the submitted version.

---

## Architecture
