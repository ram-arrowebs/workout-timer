# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Workout Counter: speaks rep numbers aloud during sets and counts down rest between sets. It ships three ways from one codebase:

- **Web (PWA):** plain HTML/CSS/JS at the repo root, with no build step and no tests. It is served by GitHub Pages straight from `main` at <https://ram-arrowebs.github.io/workout-timer/>. `privacy.html` is the store privacy policy URL.
- **iOS and Android apps:** Capacitor 8 wrappers in `ios/` and `android/` (bundle/package ID `com.arrowebs.workoutcounter`). On the App Store the app is listed as "Big Workout Counter"; its home-screen name is "Workout Counter".

## Commands

```
python3 -m http.server 8080          # run the web app at http://localhost:8080
npm run sync                         # copy web files into www/ and run cap sync (after any web change)
npm run assets                       # regenerate native icons/splash from assets/*.png
scripts/release-ios.sh <build> [--upload]   # signed IPA in build/ios/export; --upload sends it to App Store Connect
scripts/release-android.sh <code>           # signed AAB in build/android/
node scripts/play-upload.mjs <aab> [track]  # upload an AAB to a Play track (default internal)
node scripts/screenshots.mjs                # re-render store/screenshots/* and the Play feature graphic
node scripts/store-ios.mjs                  # push store/metadata.json + iOS screenshots to App Store Connect
node scripts/store-play.mjs                 # push store/metadata.json + Play graphics/screenshots to Google Play
```

- Version names come from `package.json` `version`. Build numbers and version codes are passed as arguments and must increase with every upload.
- Xcode is not the active developer dir, so the scripts set `DEVELOPER_DIR` to `/Applications/Xcode.app/Contents/Developer`. Android needs JDK 21. Gradle 8.14 does not run on Android Studio's bundled JDK 25.
- Play only accepted uploads through the API after the first AAB was uploaded by hand. That is done, so `play-upload.mjs` now works.
- `screenshots.mjs` drives the real app in Playwright WebKit with a stubbed `window.Capacitor` and a fake clock (`page.clock.runFor`) to reach each timer state, then frames each capture with a caption from `store/metadata.json`. Output is JPEG, because both stores reject alpha channels. If `npx playwright install webkit` hangs while unpacking, download the zip from the URL it prints and unzip it into `~/Library/Caches/ms-playwright/webkit-<rev>/`, then add an `INSTALLATION_COMPLETE` file.
- Do not run `capacitor-assets generate` without `--ios --android`. Otherwise it writes webp PWA icons into `icons/`, but the manifest deliberately lists only PNGs.

## Architecture

- `app.js` is one IIFE (ES5 style: `var`, `function`, no modules), split into sections marked by `// ----` comment banners: speech, wake lock, settings, timer state, render, events, install, full screen, and init. Keep this style; there is no transpiler or bundler.
- **Timer state machine:** `state.phase` goes `idle → countdown → rep ⇄ rest → done`. A 100 ms `setInterval` calls `tick()`, which compares `performance.now()` with the absolute `state.phaseEnd` and calls `advance()` in a loop until it catches up. Deadlines chain as `phaseStart = previous phaseEnd`, so a throttled background tab re-syncs instead of drifting. Pause stores `pausedAt`. Resume shifts `phaseStart`, `phaseEnd` and `pausedTotal` by the time spent paused. The elapsed clock starts when the countdown ends, not when Start is pressed.
- **Speech:** `speech.say(text)` cancels any utterance in progress unless it gets `{interrupt: false}`, which `announceSet()` uses to queue "Set N" and then "1". In a browser, speech only works after a user gesture; the Start submit provides one.
- **Side effects at session boundaries:** `start()` requests the wake lock and full screen. `finish()` releases both. `visibilitychange` asks for the wake lock again and forces a `tick()`.
- **Settings** are saved to `localStorage` under `wotimer.settings` and merged over `DEFAULTS`. Validation ranges live in `readForm()` and are repeated in the `min`/`max` attributes in `index.html`. Change both together.
- **Screens** are three `<section>`s in `index.html` (setup, session, summary), toggled with `hidden` by `showScreen()`. Phase styling uses body classes (`phase-rest`, `phase-countdown`, `is-paused`).

## Native apps (Capacitor)

- `scripts/build-web.mjs` copies the web files, minus `sw.js`, into `www/` (gitignored), and `cap sync` copies `www/` into the native projects. Add any new web file to its list.
- `app.js` has no Capacitor JS import. It detects `window.Capacitor` (injected by the native bridge before page scripts run), checks `Capacitor.PluginHeaders` for a plugin, and calls `Capacitor.nativePromise(plugin, method, opts)`. On native platforms:
  - speech goes through `TextToSpeech` (`@capacitor-community/text-to-speech`), because Android's WebView has no `speechSynthesis`;
  - the wake lock goes through `KeepAwake`;
  - the install button, the browser Fullscreen API and service worker registration are skipped.
- `capacitor.config.json` hides the system bars (`SystemBars.hidden`) to match the PWA's fullscreen display mode.
- iOS:
  - `AppDelegate.swift` sets the audio session to `.playback` with `.mixWithOthers`, so counts are spoken with the silent switch on and over music.
  - The app is universal (iPhone and iPad), and `ITSAppUsesNonExemptEncryption` is false. On tablets, `styles.css` scales the setup and summary cards with `zoom` (at ≥740×900 CSS px).
- **iOS signing:** archives use automatic signing (team `SL57DN75D9`). Export uses manual signing (`ios/ExportOptions.plist`) with the "Workout Counter App Store" profile and the local Apple Distribution certificate. Cloud signing fails with the API key ("Cloud signing permission error"). If the profile expires, create a new one through the App Store Connect API.
- **Store listing:** all text lives in `store/metadata.json`; screenshots and graphics are in `store/`. The App Store screenshot sets are `APP_IPHONE_67` (1320×2868) and `APP_IPAD_PRO_3GEN_129` (2064×2752). Play uses phone 1080×1920, tablet 1440×2560 (for both 7" and 10"), a 1024×500 feature graphic and a 512 px icon. TestFlight has an "Internal" group.
- **Android signing:** `android/app/build.gradle` reads the upload key from `~/.config/play/workoutcounter-upload.properties`. The keystore lives next to it, and Play App Signing holds the app signing key.

## Service worker / manifest gotchas

- `sw.js` is network-first and falls back to the cache when offline. **Bump `CACHE` (`wotimer-vN`)** whenever shell files change, and add any new shell file to `SHELL`.
- The manifest deliberately has no `id` and lists only PNG icons. `display` is `fullscreen`. Copies installed under an older manifest keep their old display mode until they are reinstalled.
- All paths are relative (`./`) because the app is served from the `/workout-timer/` subpath on GitHub Pages.

## Store credentials

- App Store Connect API key: `~/.appstoreconnect/private_keys/AuthKey_AJ6N98KP5T.p8`. The key ID is `AJ6N98KP5T` and the issuer ID is `69a6de74-d9e1-47e3-e053-5b8c7c11a4d1`. The app's Apple ID is `6821566766`.
- Google Play service account: `~/.config/play/android-development-511108-d615497e8111.json` (`birdcalls@android-development-511108.iam.gserviceaccount.com`). It has release access to the app through the Android Publisher API.

- App Review contact (name, email, phone) for `scripts/store-ios.mjs`: `~/.appstoreconnect/review-contact.json`. It is kept out of the public repo.

Never copy these files or the upload keystore into the repo, and never print their contents.
