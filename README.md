# CaffeLook

A browser & desktop **avatar** for the character *Tomari*. The avatar turns to follow
your mouse (or your face via webcam) across **15 directions**, lip-syncs from the
microphone, and auto-blinks. No backend — everything runs locally in the browser, and
it's also packaged as a Windows desktop app via Electron.

---

## Features

- **Mouse follow** — the head turns across a 5×3 grid (15 directions: up↔down × 45°left / front / 45°right).
- **Lip sync** — microphone RMS level drives a 3-stage mouth (closed / half / open).
- **Auto-blink** — randomized single/double/slow blinks.
- **Face tracking** — drive direction, mouth, and blink from a webcam using **MediaPipe FaceLandmarker** (runs fully on-device; no video leaves your machine).
- **Streaming / meetings** — solid chroma background + **Hide UI (F9)** for OBS Window Capture → Chroma Key (→ OBS Virtual Camera for meetings).
- **Character switching** — pick from a `characters/` folder; add your own in-app with automatic chroma-key background removal and head auto-centering.

---

## Requirements

- **Node.js** `^20.19` or `>=22.12` (required by Vite 8).
- Microphone input only works on `localhost` or HTTPS.

```bash
npm install
```

The MediaPipe face-tracking model + WASM (~25 MB) live in `public/mediapipe/` and are
committed. If you ever need to re-fetch them:

```bash
npm run setup:mediapipe
```

---

## Run (development)

```bash
npm run dev
```

The dev server starts at `http://127.0.0.1:5173` and auto-opens `/talk.html`.
On Windows you can also double-click `start.bat`.

### Desktop (Electron) in dev

```bash
npm run electron:dev   # starts Vite + opens the Electron window
```

---

## Build

### Web (GitHub Pages)

```bash
npm run build          # → dist/ (base path /tomari-guruguru/)
npm run verify:pages   # validate dist/ against Pages expectations
npm run preview        # serve dist/ at http://127.0.0.1:4173/tomari-guruguru/talk.html
```

`verify:pages` asserts the built HTML uses the `/tomari-guruguru/` base path, that
referenced assets exist, and that each of the 6 sheets (`A`–`F`) under
`dist/slices2/` contains exactly **15** `.webp` files. CI runs `build` + `verify:pages`
on every PR/push to `main`; deploy happens only on `main`.

### Desktop (portable .exe)

```bash
npm run build:desktop  # vite build --mode electron (base './' for file://)
npm run dist           # build:desktop + electron-builder → release/ portable .exe
```

The app icon is `CaffeLook.ico` (configured in `electron-builder.yml`).

---

## Project structure

```
.
├── index.html              # meta-refresh redirect to talk.html
├── talk.html               # app entry (loads tweaks-panel.jsx then talk-app.jsx)
├── vite.config.js          # multi-page Vite config + dev character middleware
├── package.json
├── electron-builder.yml    # desktop packaging (portable .exe, CaffeLook.ico)
├── start.bat               # Windows dev launcher
├── CaffeLook.ico           # desktop app icon
├── electron/               # desktop app
│   ├── main.cjs            # window, menu, media permissions, IPC, custom protocol
│   ├── preload.cjs         # window.tomariDesktop bridge
│   ├── settings.cjs        # JSON settings store (userData)
│   └── characters.cjs      # filesystem character discovery / creation
├── src/
│   ├── talk-app.jsx        # main app + in-app character slicer (sliceSheets)
│   ├── engine/             # useAvatarLoop (rAF loop) + shared helpers (cellFromXY…)
│   ├── drivers/            # input sources: mouseDirection, audioMouth, blinkTimer, faceTracking
│   ├── tweaks-panel.jsx    # floating Tweaks panel + useTweaks (loaded first)
│   ├── character-config.js # single source of truth for the grid + frame paths
│   └── character-guide.js  # generation prompts + in-app guide text
├── public/
│   ├── slices2/            # bundled character frames (committed)
│   ├── guide/              # template.png / template-grid.png (placement reference)
│   └── mediapipe/          # FaceLandmarker model + WASM (committed)
├── scripts/
│   ├── verify-pages-build.mjs
│   └── fetch-mediapipe.mjs
├── tools/
│   └── slice_character_sheets.py   # high-fidelity character slicer (ffmpeg)
├── docs/                   # character guide + planning notes
├── characters/             # added characters (git-ignored)
├── LICENSE                 # MIT (code)
└── ASSET_LICENSE.md        # non-commercial (character art/audio)
```

---

## How the frames work

The character is a set of pre-rendered images swapped in real time — direction and
expression changes are instant because every frame for the current state is preloaded
and only the active one is shown.

### 15 directions (5 rows × 3 columns)

- **Columns** (`c0`–`c2`): `c0` 45° left · `c1` front · `c2` 45° right
- **Rows** (`r0`–`r4`): `r0` strong up · `r1` up · `r2` level · `r3` down · `r4` strong down

The center / neutral pose is `r2c1`.

### 6 sheets (eyes × mouth)

| Folder | Eyes   | Mouth  |
|--------|--------|--------|
| `A`    | open   | closed |
| `B`    | open   | half   |
| `C`    | open   | open   |
| `D`    | closed | closed |
| `E`    | closed | half   |
| `F`    | closed | open   |

6 sheets × 15 directions = **90 frames**. Example path: `slices2/A/r2c1.webp`.
The grid size and frame-path pattern live in `src/character-config.js` (`rows: 5, cols: 3`).

---

## Usage

1. Open `talk.html`.
2. Press **Start mic** — the mouth follows your voice (closed / half / open).
3. Move the mouse — the head turns to follow it; auto-blink runs on a timer.
4. Open the **Tweaks** panel (bottom-right) to adjust sensitivity, follow range/speed,
   character size, background, and output options.

### Face camera

Press **Start face cam** to drive the avatar from your webcam instead of the mouse.
Look straight ahead and use Tweaks → **Calibrate** to set center. Optionally enable
**Mouth from face** and **Blink from face**. Inference is local (MediaPipe); stopping
the camera returns control to the mouse. Use the camera tuning controls
(brightness/contrast, resolution, detection thresholds) if tracking is unstable.

---

## Streaming & meetings (OBS)

1. In **Tweaks → Output**, turn on the **greenscreen** background (pick a chroma color).
2. Press **F9** to hide all UI (desktop also hides the window menu bar). Only the
   character renders. Hide-UI is not persisted — it always starts visible.
3. In OBS add a **Window Capture** of the app window.
4. Add a **Chroma Key** filter to remove the background.
5. For meetings, start **OBS Virtual Camera** and select it in Zoom/Meet/Teams.

---

## Characters

Open the **Characters** handle (left edge) to switch. Each character is a folder that
mirrors the bundled layout: `<name>/A…F/r#c#.webp` (90 frames). Discovery is:

- **Desktop (.exe):** a `characters/` folder is created next to the executable and
  seeded with the default Tomari on first run.
- **`npm run dev`:** the project-root `characters/` folder (served by dev middleware).
- **GitHub Pages:** static, so only the bundled character is available.

### Add a character in-app (`+ Add character`)

Available in the desktop app and `npm run dev`:

1. Open **? How to make** — it shows the angle template and copies the generation
   prompt for producing the 6 angle sheets (A–F).
2. Open **+ Add character**, pick the 6 sheets, keep **Auto-center heads** on (set the
   background color if you didn't use green), name it, and **Create**.
3. The app chroma-keys the background to transparent, auto-centers each head
   (horizontal center + chin anchor), slices the 5×3 grid into 90 frames, and selects
   the new character.

For tricky art (overflowing hair, soft edges, residue), `tools/slice_character_sheets.py`
(`component` mode, requires `ffmpeg`/`ffprobe`) is the high-fidelity alternative.

### Make your own character

The full workflow — the 5×3 grid, the 6 A–F sheets, the generation prompts, and both
slicing paths — is documented in **[`docs/character-guide.md`](docs/character-guide.md)**.
The prompts themselves are the source of truth in `src/character-guide.js`.

---

## License

This repo splits licensing between code and assets:

- **Code** — MIT License (see `LICENSE`).
- **Character art, slices, thumbnails, and audio** — **not** MIT; non-commercial only
  (see `ASSET_LICENSE.md`). Don't relicense or reuse the assets outside this project.

---

## Tech stack

- **Vite 8** — build + dev server (multi-page)
- **React 18** — UI
- **@mediapipe/tasks-vision** — on-device face landmarking
- **Electron** — Windows desktop packaging
