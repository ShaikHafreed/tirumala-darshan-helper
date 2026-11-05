# Tirumala Darshan Helper

An unofficial browser extension (Microsoft Edge / Chrome, Manifest V3) that helps you get ready for TTD Tirumala Special Entry Darshan booking:

- keeps pilgrim details on your own computer, encrypted with your PIN
- types **only the text boxes** (name, age, ID number) of the Pilgrim Details form when you press the button
- reminds you 10 minutes before, 5 minutes before and at release time, on your PC and your phone

> **Not affiliated with, endorsed or approved by Tirumala Tirupati Devasthanams (TTD).** You do the login, OTP, queue, dropdown choices (Gender, Photo ID type), payment and accept TTD's terms yourself. This is a form-filling helper, not a booking bot.

## What it does not do (on purpose)
No slot polling or auto-refresh, no automatic slot selection, no OTP or captcha handling, no auto-submit or payment, no trusted-input or debugger tricks, no cloud sync, no analytics.

## Install (developer mode)
1. Download this repository (or a release zip) and unzip it.
2. Open `edge://extensions`, switch on **Developer mode**, click **Load unpacked** and pick the folder.
3. Pin the extension, click its icon, read the notice and sign up (name, mobile number, 6-digit PIN).

## Using it
1. **Pilgrims** tab: add people. ID numbers are *not* saved unless you switch that on in Settings.
2. **Alerts** tab: enter the official release time (from TTD's announcement). Optional: switch on phone alerts, install the free [ntfy](https://ntfy.sh) app and subscribe to your private topic (or scan the QR code), then press **Send test to phone**.
3. **Home** tab: the countdown and a booking-day checklist. On the Pilgrim Details page press **Preview and fill**, check the preview, then **Fill now**. Pick Gender and Photo ID type yourself; the ID number fills afterwards.
4. Not sure? Press **Practice on the demo page** first.

## Privacy in short
Everything stays in your browser except phone alerts, which go through ntfy.sh if you switch them on (a secret random topic plus the alert text; no names or ID numbers). See [PRIVACY.md](PRIVACY.md).

## Development
```
npm test            # unit tests (node --test)
npm run test:e2e    # Playwright against the demo page (needs: npm i -D playwright)
node tests/e2e/popup.e2e.cjs   # loads the extension in Chromium and drives the popup
npm run lint        # syntax check
npm run package     # builds dist/tirumala-darshan-helper-<version>.zip
```
Layout: `lib/` (validation, schedule, crypto, vault, i18n), `background.js` (alarms, notifications, ntfy), `fill.js` (page script), `popup.*`, `reminder.*`, `mock.*` (practice page).

## Known limits
- Reminders need Edge to be running on the PC. Phone alerts are queued on the ntfy server up to 3 days ahead, so open Edge once in the 3 days before release.
- The TTD site can change; if filling stops working the extension refuses to guess and offers a copy panel. Use **Copy problem report** (no personal data) when filing an issue.
- Telugu, Hindi and Tamil texts need review by native speakers.

## Licence
MIT, see [LICENSE](LICENSE). Bundled: qrcode-generator 1.4.4 (MIT, Kazuhiko Arase).
