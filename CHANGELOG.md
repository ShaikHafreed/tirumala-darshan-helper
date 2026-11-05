# Changelog

## 1.0.0
- Passport pop-up: save Country, Visa/OCS number, Type of Visa and Visa validity per pilgrim; the pop-up text boxes fill after you pick Passport (date and any dropdown are left to you).
- Renamed to Tirumala Darshan Helper; new original icon.
- Encrypted storage (AES-GCM, PIN-derived key), 6-digit PIN, lockout ladder, auto-lock, optional ID-number saving (off by default), migration from older profiles.
- Reminders at 10 min, 5 min and release time; missed-alert handling; time-zone warning; PC beep.
- Phone alerts via ntfy with 128-bit topic, consent screen, topic rotation, QR code, server-side queue and cancel.
- Safer form filling: strict field matching, per-pilgrim rows, fill preview, copy panel, redacted problem report, practice page.
- Booking-day checklist, health check, big countdown, 3-step first run, English/Telugu/Hindi/Tamil UI, pilgrim groups, encrypted export/import.
- Reduced permissions: no standing TTD host permission, optional ntfy permission.
- Unit and end-to-end tests, CI.
- Add the release time to a phone calendar (.ics with alarms).
- In-app feedback: star rating and message sent as a prefilled GitHub issue.
- Page helpers: on-page copy panel, orange hint for the next dropdown to pick, green marks on correct boxes, CSV import, Open TTD site link.
- Gentle motion: drifting clouds, falling petals, glinting kalasams, moving garland, fade-in screens (off when the system asks for reduced motion).
- Signature motion: temple doors open on unlock, turning chakra behind the countdown, flickering diya, rolling digits, sliding tab marker, ringing bell when armed, marigold-petal burst on success.
- Sky that follows the time of day (dawn, day, dusk, night with stars and moon), rotating Govinda greetings, sunrise scene on the login screen, six lamps that light for selected pilgrims, three alert lamps (10 min, 5 min, release), 'Ready for booking' glow, namam stamp on selected pilgrims.
