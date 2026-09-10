# Workout Counter

A small installable web app (PWA) that counts your reps out loud. Set the number of sets, reps
per set, seconds per rep, rest seconds between sets and an optional get-ready countdown, then press
Start. After the countdown (spoken 3, 2, 1) the current rep number
fills the screen and is spoken by the device. Rest periods show a countdown and announce the next
set. Pause, resume or complete the session at any time.

No build step and no dependencies: plain HTML, CSS and JavaScript.

Live app: <https://ram-arrowebs.github.io/workout-timer/> (open on your phone and use "Add to Home Screen" to install).

## Run locally

```
python3 -m http.server 8080
```

Open <http://localhost:8080>. Service workers and the install prompt only work on `localhost` or
over HTTPS, so deploy the folder to any static host (GitHub Pages, Netlify, Cloudflare Pages) to
use it on a phone.

## Files

- `index.html` – setup, session and summary screens
- `styles.css` – fullscreen layout, dark theme, safe-area handling
- `app.js` – settings, timer state machine, speech, screen wake lock
- `sw.js` – service worker that caches the app shell for offline use (bump `CACHE` when files change)
- `manifest.webmanifest`, `icons/` – install metadata and icons

## Known limits

- Browsers throttle or suspend JavaScript when the tab is in the background or the screen locks.
  The app requests a screen wake lock while a session runs, so keep it in the foreground. Timing
  uses absolute deadlines, so it re-syncs after any throttling instead of drifting.
- Speech synthesis needs a user gesture first; pressing Start provides it. On iOS the silent
  switch mutes speech.
- Speech uses the device's default voice and language.
