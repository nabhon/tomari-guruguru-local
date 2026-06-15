# Desktop App Roadmap

Plan for evolving トマリぐるぐる / トマリトーク from a browser page into a streaming/meeting-ready desktop avatar app. Three cycles, each independently shippable.

Status: **planning** (nothing below is implemented yet).

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
- Main process creates a `BrowserWindow` loading `talk.html` (default), with a menu/tray to switch to `guruguru.html`.
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

### Cycle 2a — Transparent window + greenscreen preset (no native code)
Covers OBS streamers immediately with zero driver work.
- [ ] Render the character to a **transparent, borderless, always-on-top, optionally click-through** Electron window (`transparent: true`, `frame: false`, `setIgnoreMouseEvents`). OBS Window/Game Capture picks up the alpha on Windows. → real transparent output for streaming.
- [ ] Add a **greenscreen background preset** (and arbitrary chroma color) to the existing `bgColor` tweak, plus a chroma-friendly default. → covers users who'd rather chroma-key.
- [ ] "Output mode" UI: normal / transparent-overlay / greenscreen.

### Cycle 2b — Real virtual camera device (native, harder)
For users who want the character to appear directly as a webcam in Zoom/Meet/Teams without OBS.
- [ ] Capture the character canvas via `canvas.captureStream()`.
- [ ] Feed frames to a virtual camera device. No built-in API exists; options, in order of effort:
  - Depend on **OBS Virtual Camera** being installed (DirectShow filter) and document the OBS route — lowest effort, offloads the driver problem.
  - Bundle a **native virtual-camera module / DirectShow filter** so the app exposes its own camera device — highest effort, needs native build + code signing on Windows, and a separate path for macOS (CoreMediaIO DAL plugin).
- [ ] Background for this path is **greenscreen** (opaque), since UVC has no alpha.

### Cycle 2c — Optional: NDI output (stretch)
- [ ] NDI sender for true-alpha output into NDI-aware OBS/Zoom. Nice-to-have, scope later.

### Decision — RESOLVED: OBS / streaming first
**2a is the priority and the Cycle 2 deliverable.** Transparent overlay window + greenscreen preset cover streaming with no native code. **2b (real virtual camera) is deferred** — revisit only if meeting-app/webcam demand shows up after 2a ships. 2c (NDI) stays a stretch.

---

## Cycle 3 — Webcam face tracking

Drive the character's head direction (and optionally mouth + blink) from the user's face instead of the mouse.

### Approach
- Use **MediaPipe Tasks Vision — FaceLandmarker** (WASM, runs in the renderer, no server). It provides:
  - `facialTransformationMatrix` → derive **head yaw/pitch** → feed the existing `{x,y}` → 5×5 grid mapping (this is exactly the Cycle 0 "direction driver" interface — mouse swaps out for face).
  - **Blendshapes** as a bonus: `jawOpen` → mouth stage (alternative/supplement to audio), `eyeBlinkLeft/Right` → blink driver. This unifies talk-app behavior with real facial expression.
- Reuse the existing **smoothing** tweak for the head-pose lerp; add a **neutral/center calibration** ("look straight ahead, click to zero") and a **sensitivity** tweak so a small head turn can reach full left/right.

### Tasks
- [ ] Add MediaPipe FaceLandmarker, camera selection UI, start/stop
- [ ] Head pose → direction driver (yaw→x, pitch→y), calibration + sensitivity tweaks
- [ ] Optional: jawOpen → mouth driver; eyeBlink → blink driver (toggle in Tweaks)
- [ ] Input-source switch in UI: mouse / face
- [ ] Graceful fallback to mouse if no camera / permission denied

### Risks / notes
- **Camera contention**: the *input* tracking webcam and the Cycle 2 *output* virtual camera are different devices, so they don't conflict — but watch CPU (face inference + canvas streaming together).
- Lighting/latency: needs smoothing + a sensible inference rate (don't run at full FPS if costly).
- Privacy: tracking is fully local (WASM); state that clearly in UI.

---

## Suggested order & dependencies

1. **Cycle 0** (small refactor) — unlocks clean plug-in points.
2. **Cycle 1** (Electron) — needed before any virtual-camera/native work; also fixes tweak persistence.
3. **Cycle 2a** (transparent window + greenscreen) — fast, high value for streamers. **This is the Cycle 2 deliverable.**
4. **Cycle 3** (face tracking) — independent; the last planned cycle.
5. **Cycle 2b** (real virtual camera) — *deferred*, not scheduled. Revisit only if meeting-app/webcam demand appears.

Each cycle ends shippable. The existing web (GitHub Pages) build should keep working throughout.
