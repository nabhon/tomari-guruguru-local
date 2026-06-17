# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**トマリトーク** (`talk.html` / `src/talk-app.jsx`) — a browser/desktop avatar for the character "Tomari" that turns to follow the mouse across 15 directions and lip-syncs from the mic with auto-blink.

Frontend (React + Vite), deployed to GitHub Pages, and also packaged as a Windows desktop app via Electron (`electron/`). No backend. (A second mouse-follow-only "ぐるぐる" mode was removed; the `guruguru` name survives only in the repo name and the `/tomari-guruguru/` Pages base path.)

## Commands

```bash
npm run dev          # dev server at http://127.0.0.1:5173 (auto-opens /talk.html)
npm run build        # vite build → dist/ (Pages target, base /tomari-guruguru/)
npm run preview      # serve dist/ at the Pages base path /tomari-guruguru/ (port 4173)
npm run verify:pages # validate dist/ against Pages expectations (run after build)
npm run electron:dev # run the Electron app against the dev server
npm run build:desktop# vite build --mode electron (base './' for file://)
npm run dist         # build:desktop + electron-builder → portable .exe in release/
```

There are no tests and no linter. `npm run verify:pages` (see `scripts/verify-pages-build.mjs`) is the closest thing to a test — it asserts the built HTML uses the `/tomari-guruguru/` base path (not root `/assets/`), that referenced assets exist, and that each of the 6 sheets (`A`–`F`) under `dist/slices2/` contains exactly 15 `.webp` files. CI (`.github/workflows/pages.yml`) runs `build` then `verify:pages` on every PR/push to `main`; deploy only happens on `main`.

Node ^20.19 or >=22.12 is required (Vite 8 constraint). Mic input only works on `localhost` or HTTPS.

## Architecture

**Multi-page Vite app.** `vite.config.js` declares two HTML inputs (`index.html`, `talk.html`); `index.html` is just a meta-refresh redirect to `talk.html`. `base` is `/` in dev, `/tomari-guruguru/` for the Pages `build`, and `./` for `--mode electron` (file://) — never hardcode asset paths; rely on Vite's base resolution and reference public assets relatively.

**`talk.html` loads two module scripts, in order:** `src/tweaks-panel.jsx` then `src/talk-app.jsx`. This ordering is load-bearing — `tweaks-panel.jsx` defines the Tweaks UI components and `useTweaks`, then assigns them onto `window` (`Object.assign(window, {...})`). `talk-app.jsx` uses `TweaksPanel`, `useTweaks`, `TweakSlider`, etc. as **globals without importing them**. If you add a Tweak control or rename one, update the `window` export list at the bottom of `tweaks-panel.jsx`.

**Behavior is split into pluggable drivers (Cycle 0 refactor).** `src/talk-app.jsx` composes input *sources* over a shared loop rather than hardcoding them: `src/engine/useAvatarLoop.js` runs the single `requestAnimationFrame` loop (smooth target → grid cell, plus an `onFrame` seam); `src/drivers/mouseDirection.js` (pointer → direction), `src/drivers/audioMouth.js` (`useAudioMouth` — audio → mouth stage), `src/drivers/blinkTimer.js` (timer → blink), and `src/drivers/faceTracking.js` (`useFaceTracking` — webcam → all three channels; see below). `src/engine/shared.js` holds `clamp`/`cellFromXY`/`themeColors`/`BG_OPTIONS`. `src/drivers/types.js` documents the source contract (the face source is the "one inference loop backs multiple channels" case it anticipated).

**`src/character-config.js` is the single source of truth for character art.** It maps a sheet letter + (row, col) to an image path via `src(sheet, r, c)` → `slices2/<sheet>/r<r>c<c>.webp`. The 15 directions are a 5×3 grid (`r0`=look up … `r4`=look down; `c0`=45° left, `c1`=front, `c2`=45° right). The 6 sheets are eye×mouth combinations: `A`/`B`/`C` = eyes open with mouth closed/half/open, `D`/`E`/`F` = eyes closed with the same mouth states. To swap characters, regenerate the slices and adjust `basePath`/`ext` here only.

**Runtime character switching** is layered on top via `charConfig.srcFrom(base, sheet, r, c)` (the renderer holds a `charBase` and swaps it; `src()` is just `srcFrom(basePath, …)`). Discovery is **tri-modal** because scanning a `characters/` folder needs a filesystem: **Electron** (`window.tomariDesktop.listCharacters()` → frames served by a privileged custom protocol `tomari-char://chars/<name>/…`, handled in `electron/main.cjs` via `electron/characters.cjs`), **dev** (`npm run dev` → a `configureServer` middleware in `vite.config.js` exposes `/__characters` + `/characters/…`), and **static Pages** (no scan → built-in `slices2` only). The `characters/` dir lives **next to the portable .exe** (`PORTABLE_EXECUTABLE_DIR`, else project root in `electron:dev`) and `ensureDefaultCharacter()` seeds it with the bundled トマリ on first run. Each character folder mirrors the `slices2` layout (`<name>/A…F/r#c#.webp`); validity = has an `A/` subfolder. The selected character id persists in the `character` tweak and falls back to built-in if its folder is gone. `characters/` is git-ignored.

**In-app "Add character"** (left menu, Electron + dev only): a popup takes the 6 angle sheets, and `sliceSheets()` in `talk-app.jsx` does a **simple 5×3 grid split** on a Canvas → 90 webp `ArrayBuffer`s, written via `characters:create` IPC (`electron/characters.cjs createCharacter`) or, in dev, `POST /__characters/create` (the `vite.config.js` middleware, base64). This is intentionally simpler than `tools/slice_character_sheets.py` (no connected-component extraction / gray-residue removal) — fine for prompt-following AI sheets; the Python tool stays the high-fidelity path. The **"How to make"** guide popup shows `public/guide/template.png` and copies `GEN_PROMPT` from `src/character-guide.js` (the generation prompt is inlined there; the full workflow is documented in `docs/character-guide.md`).

**Rendering approach:** all frames for the current state are rendered as stacked absolutely-positioned `<img>`s; only the active one has `opacity: 1`. This preloads every frame so direction/mouth changes are instant with no flicker. Auto-blink is a self-scheduling `setTimeout` chain with randomized intervals (single/double/slow blinks) in `blinkTimer.js`.

**Capture output (Cycle 2a):** the `greenscreen`/`chromaColor` tweaks paint a solid chroma background (for OBS Chroma Key), and an ephemeral `hideUI` state (local `useState`, **not** persisted — always starts visible) hides all chrome so only the character renders. `hideUI` toggles via **F9** (a renderer `keydown`, works on web and desktop) or, in Electron, the 表示 menu "UIの表示/非表示" item → `webContents.send('toggle-ui')` → `window.tomariDesktop.onToggleUI` (preload). There is no transparent/frameless window and no native virtual camera; OBS Window Capture + Chroma Key (+ OBS Virtual Camera for meetings) covers both streaming and meetings.

**Face tracking (Cycle 3)** (`useFaceTracking` in `src/drivers/faceTracking.js`): one webcam + one **MediaPipe Tasks Vision `FaceLandmarker`** loop (WASM, fully local) backs all three channels — `facialTransformationMatrix` → head yaw/pitch → writes `targetRef` (same contract as the mouse driver), `jawOpen` blendshape → `frameMouth(now,tw)` (same shape/debounce as `audioMouth`), `eyeBlink{L,R}` → blink boolean. Direction is always-on while the camera runs (the mouse driver took an `enabledRef` and stops writing then); mouth/blink-from-face are opt-in tweaks. Inference is throttled (~30fps via `requestVideoFrameCallback`); calibration captures a neutral pose (auto on first frame + a Tweaks "Calibrate" button); failures fall back to mouse. **Accuracy controls:** brightness/contrast are applied in software — each frame is drawn to a `<canvas>` with `ctx.filter` and *that canvas* is fed to `detectForVideo` (camera-native constraints are unreliable, so this is not used); the same canvas doubles as the mirrored live preview. Camera-device + resolution changes go through `applyCamera()` (re-`getUserMedia`, keep the model); detection-confidence thresholds (creation-time options) go through `applyDetection()` (rebuild the landmarker, keep the stream) — both debounced. `cameraId` is runtime-only (deviceIds are machine-specific); the rest persist. `@mediapipe/tasks-vision` is **dynamically imported** (own lazy chunk). Assets live in `public/mediapipe/` (WASM + `face_landmarker.task`, ~25 MB, committed via the `!public/mediapipe/` .gitignore exception), generated by `scripts/fetch-mediapipe.mjs` (`npm run setup:mediapipe`) and loaded via `import.meta.env.BASE_URL` so all three base targets resolve. `verify:pages` asserts they exist; Electron's `'media'` permission already covers the camera.

**Audio engine** (`makeAudioEngine` / `useAudioMouth` in `src/drivers/audioMouth.js`): a Web Audio analyser computes RMS level from the mic; the level (after gain + asymmetric attack/release envelope) is thresholded into 3 mouth stages (`thHalf`, `thFull`). Mouth switching is debounced (~70ms) to avoid jitter. The loop calls `useAudioMouth().frame(now, tw)` via `useAvatarLoop`'s `onFrame`.

### The Tweaks panel / EDITMODE protocol

The floating "Tweaks" panel is a generic harness scaffold, not bespoke to this project. Two non-obvious things:

- Tweak defaults live in a `/*EDITMODE-BEGIN*/{ ... }/*EDITMODE-END*/` JSON block in `talk-app.jsx`. Persistence in `useTweaks` is bridge-aware: in the **Electron** build it loads/saves via `window.tomariDesktop` (preload → `userData/settings.json`, key `'talk'`); otherwise it falls back to posting `__edit_mode_set_keys` to `window.parent` for an external host. In a plain `npm run dev` browser session there is no host, so changes are in-memory only and reset on reload. Keep the block as valid JSON literal and keep the markers intact.
- `tweaks-panel.jsx` carries an `@ds-adherence-ignore` marker and uses raw hex/px by design — don't "fix" its styling to a design system.

### Desktop (Electron)

`electron/main.cjs` (window + media-permission handler + always-on-top menu + window-bounds persistence), `electron/preload.cjs` (exposes `window.tomariDesktop` tweak bridge), `electron/settings.cjs` (dependency-free JSON store in `userData`). Main is CommonJS (`.cjs`) on purpose. Dev loads the Vite server URL; packaged loads `dist/talk.html` over `file://` (all asset/nav paths are relative, so this works). The Pages build (`npm run build`) and `verify:pages` are a separate target from `build:desktop` — don't run `verify:pages` against the `--mode electron` output (it uses `base: './'` and would fail the Pages assertions).

## Character asset pipeline

`tools/slice_character_sheets.py` slices six 5×3 sheet PNGs (from `新キャラ資料/`) into the 90 individual `public/slices2/<A–F>/r#c#.webp` frames. It shells out to **ffmpeg/ffprobe** (must be on PATH). `public/slices2/` is committed; the source `sheets/`, `uploads/`, and `新キャラ資料/` directories are git-ignored. Full workflow is in `docs/character-guide.md`.

## License boundary

Code is MIT (`LICENSE`). Character images, slices, thumbnails, and audio are **not** MIT and are non-commercial only (`ASSET_LICENSE.md`). Don't relicense or reuse the assets outside this project.
