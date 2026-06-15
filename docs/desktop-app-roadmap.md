# Desktop App Roadmap

Plan for evolving トマリトーク from a browser page into a streaming/meeting-ready desktop avatar app. Three cycles, each independently shippable.

Status: Cycle 0 (driver refactor), Cycle 1 (Electron), Cycle 2a (greenscreen + hide-UI), and Cycle 3 (webcam face tracking) are **done** — all planned cycles complete. The mouse-follow-only "ぐるぐる" mode was removed, leaving トマリトーク as the only app. Cycle 2b (native virtual camera) and 2c (NDI) remain deferred/stretch.

---

## Cycle 0 — Foundation refactor (prep, small)

Not one of the user-requested cycles, but doing this first makes Cycles 2 and 3 clean instead of hacky. Keep it lightweight.

Today the character's behavior comes from three hardcoded sources baked into `app.jsx` / `talk-app.jsx`:
- **Direction** ← mouse position (`pointermove` → smoothed `{x,y}` → 5×5 grid cell)
- **Mouth** ← audio RMS level (talk app only)
- **Blink** ← random timer

Goal: extract these into pluggable "drivers" so we can swap the *source* without touching the rendering. Target shape:

```
direction driver:  mouse | face-tracking        → {x, y} in -1..1
mouth driver:       audio | face-tracking | none → 0|1|2
blink driver:       timer | face-tracking        → bool
```

The renderer (stacked `<img>` opacity swap) and `character-config.js` stay exactly as they are. This is mostly moving existing code behind a small interface, no behavior change.

---

## Cycle 1 — Electron desktop app

Wrap the existing Vite multi-page app in Electron and ship installable builds.

### Approach
- Add Electron + a Vite-aware build setup. Recommended: **electron-vite** (purpose-built for Vite + Electron, handles main/preload/renderer) plus **electron-builder** for packaging. Avoid hand-rolling the dev/prod URL loading.
- Main process creates a `BrowserWindow` loading `talk.html` (the only page).
- Dev mode loads the Vite dev server URL; production loads the built `dist/`. The current `base: '/tomari-guruguru/'` is for GitHub Pages — Electron loads from `file://` or a custom protocol, so base handling needs a conditional (likely `base: './'` for the Electron build target).

### Win: fix tweak persistence
Right now `setTweak` posts `__edit_mode_set_keys` to a `window.parent` host that doesn't exist in a normal session, so **tweak changes reset on reload**. In Electron we add a real persistence layer: a preload bridge (`contextBridge`) + `electron-store` (or a JSON file in `userData`) that loads saved tweaks on startup and writes them on change. This finally makes settings stick.

### Tasks
- [ ] Add electron-vite + electron-builder, wire dev/build scripts
- [ ] Main process + window; default to talk, menu/tray to swap pages
- [ ] Conditional Vite `base` for the Electron target
- [ ] Preload bridge + persistent tweak store (replaces the no-op postMessage path)
- [ ] Window prefs: size, always-on-top toggle, remember position
- [ ] electron-builder config; produce a Windows installer (NSIS) — macOS later if wanted
- [ ] Keep GitHub Pages build working (don't break the existing web target)

### Risks / notes
- Microphone permission flow differs in Electron — verify mic still works in the packaged app.
- Google Fonts load from CDN; consider bundling the font for offline use.
- Keep the web build path intact so the project stays dual-target (web + desktop).

---

## Cycle 2 — Camera / transparent output

Get the character out of its own window and into OBS / streaming / meeting software. **Split into 2a (easy, ship first) and 2b (hard, native).**

### ⚠️ Reality check on "alpha channel"
- Standard **virtual cameras (UVC)** that Zoom/Meet/Teams/Discord consume are **opaque RGB — no alpha**. True transparency cannot travel over a virtual webcam.
- True alpha is only achievable via: **(A)** a transparent window captured by OBS "Window Capture", or **(B)** **NDI** output (carries alpha; OBS/Zoom can ingest with plugins).
- For "camera output for meetings," the practical answer is a **greenscreen (solid-color) virtual camera** + chroma key in the receiving app.

So the feature breaks down as: *transparency → window/NDI capture*; *camera/meeting → greenscreen virtual cam*.

### Cycle 2a — Greenscreen + hide-UI (no native code) — **DONE**
Covers OBS streamers *and* meeting users immediately with zero driver work, and sidesteps the
transparent-window pitfall (Electron's `transparent`/`frame` can only be set at window creation,
not toggled live — so it would force window recreation or an always-frameless window).
- [x] **Greenscreen background**: `greenscreen` + `chromaColor` tweaks (green `#00B140` / blue / magenta), painting a solid chroma field instead of `bgColor`.
- [x] **Hide-UI toggle**: ephemeral `hideUI` state (not persisted) hiding all chrome so only the character shows. Toggle via **F9** (web + desktop) or the Electron 表示 menu ("UIの表示/非表示").
- [x] **Output** section in the Tweaks panel for the above.

The transparent/frameless overlay window is **dropped** for this cycle — OBS's Chroma Key removes
the green just as well, with none of the recreation/frameless cost. (Left as an optional future
stretch if a no-OBS transparent capture is ever wanted.)

### How it reaches streaming *and* meetings (no native code)
1. Turn on **Greenscreen** + **Hide UI (F9)** → window shows only the character on solid chroma.
2. **OBS** → *Window Capture* the トマリ window → add a **Chroma Key** filter → green drops out.
3. For meetings: **Start Virtual Camera** in OBS → トマリ appears as a selectable webcam in Zoom/Meet/Teams/Discord.

So the meeting-webcam goal is met via OBS's built-in virtual camera layered on greenscreen — which is exactly why **Cycle 2b (a native in-app virtual camera) stays deferred**.

### Cycle 2b — Real virtual camera device (native, harder)
For users who want the character to appear directly as a webcam in Zoom/Meet/Teams without OBS.
- [ ] Capture the character canvas via `canvas.captureStream()`.
- [ ] Feed frames to a virtual camera device. No built-in API exists; options, in order of effort:
  - Depend on **OBS Virtual Camera** being installed (DirectShow filter) and document the OBS route — lowest effort, offloads the driver problem.
  - Bundle a **native virtual-camera module / DirectShow filter** so the app exposes its own camera device — highest effort, needs native build + code signing on Windows, and a separate path for macOS (CoreMediaIO DAL plugin).
- [ ] Background for this path is **greenscreen** (opaque), since UVC has no alpha.

### Cycle 2c — Optional: NDI output (stretch)
- [ ] NDI sender for true-alpha output into NDI-aware OBS/Zoom. Nice-to-have, scope later.

### Decision — RESOLVED: OBS / streaming first; 2a shipped as greenscreen + hide-UI
**2a was the Cycle 2 deliverable and is done** — but scoped to **greenscreen + hide-UI** rather
than a transparent window (the transparent-overlay idea was dropped; OBS Chroma Key covers it).
**2b (real virtual camera) stays deferred** — OBS Virtual Camera on top of greenscreen already
delivers the meeting-webcam outcome, so revisit a native device only if a no-OBS workflow is
demanded. 2c (NDI) stays a stretch.

---

## Cycle 3 — Webcam face tracking — **DONE**

Drive the character's head direction (and optionally mouth + blink) from the user's face instead of the mouse.

### Resolved approach
- **MediaPipe Tasks Vision — `FaceLandmarker`** (WASM, runs in the renderer, fully local — no server), in **`src/drivers/faceTracking.js`**. One camera + one detection loop backs all three Cycle 0 channels (exactly the "FaceSource" `types.js` anticipated):
  - `facialTransformationMatrix` → head **yaw/pitch** → writes `targetRef.current = {x,y}`, identical to the mouse driver; `useAvatarLoop` smoothing + 5×5 grid mapping are untouched.
  - Blendshapes: `jawOpen` → `frameMouth(now,tw)` (same shape/debounce as `audioMouth`), `eyeBlink{Left,Right}` → blink boolean (with hysteresis).
- **Direction is always-on** when the camera is running; **mouth-from-face** and **blink-from-face** are independent opt-in toggles (mic + timer remain the defaults). The mouse driver gained an `enabledRef` and stops writing while the camera is on.
- **Calibration** ("look straight" → captures neutral; auto-captured on the first frame too) + **sensitivity** + **mirror/invert** tweaks. Throttled ~30fps inference (`requestVideoFrameCallback`); graceful fallback to mouse on permission/camera failure.
- **Assets bundled** under `public/mediapipe/` (WASM + `face_landmarker.task`, ~25 MB) via `scripts/fetch-mediapipe.mjs` (`npm run setup:mediapipe`), loaded with `import.meta.env.BASE_URL` so dev/Pages/electron all resolve. MediaPipe is **dynamically imported** (own lazy chunk; main bundle barely grows). `verify:pages` asserts the assets exist. Electron's existing `'media'` permission grant covers the camera — no change.

### Accuracy controls (follow-up)
Added a tracking-quality pass: software brightness/contrast (canvas `ctx.filter` → fed to detection), a live mirrored preview, camera-device selection, capture resolution (480p/720p), and MediaPipe confidence thresholds. Camera/resolution restart the stream (`applyCamera`); thresholds rebuild the model (`applyDetection`); both debounced.

### Notes
- **No camera contention** with Cycle 2: that path is OBS *Window Capture* of the app window, not a webcam, so the tracking webcam is the only camera in use.
- Privacy: inference is fully local (WASM); the UI states "顔追跡は端末内だけで処理されます（送信なし）".
- The camera starts **off** every launch (no auto-grab); calibration neutral is per-session.

---

## Suggested order & dependencies

1. **Cycle 0** (small refactor) — unlocks clean plug-in points.
2. **Cycle 1** (Electron) — needed before any virtual-camera/native work; also fixes tweak persistence.
3. **Cycle 2a** (greenscreen + hide-UI) — **done**. Fast, high value for streamers *and* meetings (via OBS Virtual Camera).
4. **Cycle 3** (face tracking) — **done**. The last planned cycle; all four are complete.
5. **Cycle 2b** (real virtual camera) — *deferred*, not scheduled. Revisit only if a no-OBS meeting-webcam workflow is demanded.

Each cycle ends shippable. The existing web (GitHub Pages) build should keep working throughout.
