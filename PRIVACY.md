# Privacy Policy: Tirumala Darshan Helper

Last updated: 2026-11-05

**Short version:** the extension has no server and no analytics. Your data stays in your browser. The only network use is optional phone alerts through ntfy.sh.

## What is stored (on your computer only)
- Profile: name, mobile number, a random salt and an encrypted check value of your PIN.
- Pilgrims you add: name, age, gender, ID type, and the ID number only if you switch on "Save ID numbers". All of this is encrypted (AES-GCM) with a key derived from your PIN (PBKDF2, 600,000 rounds). Group names and settings are not encrypted, and groups contain no personal details.
- Release time, alert log, language and ntfy topic.
Data is kept in `chrome.storage.local` of your browser profile. The unlock key is held in session memory and removed after 5 minutes or on Lock.

## What is sent over the network
Only if you switch on phone alerts and grant permission: requests to `https://ntfy.sh/<your random topic>` with the alert text (for example "TTD tickets release in 10 min") and, for queued alerts, a delivery time. **No names, ID numbers or mobile number are sent.** ntfy.sh is a third-party service with its own privacy policy (https://ntfy.sh/docs/privacy/). Anyone who learns your topic could read alerts on it, so keep it private; you can create a new topic in Alerts.

The extension never sends pilgrim details to any server. It only types them into the TTD form on your screen when you press Fill.

## Feedback
The Feedback button only opens a prefilled GitHub issue page in a new tab. Nothing is sent until you press submit on GitHub, and no profile or pilgrim data is added.

## Permissions
`storage`, `alarms`, `notifications` (reminders), `activeTab` and `scripting` (fill the form in the tab you are on, only after you click), and an optional permission for `https://ntfy.sh/*` requested only when you switch on phone alerts.

## Your control
Turn off ID saving (stored ID numbers are deleted), lock, export (encrypted), or "Delete my profile" (erases all data and queued alerts).

## Honest limits
A PIN is not strong protection against someone who has your Windows account and can try many PINs offline; use a 6-digit PIN you do not use elsewhere, or do not save ID numbers.

Contact: open an issue on the project's GitHub page.
