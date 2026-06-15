# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser avatar for the character "Tomari". Two apps share one engine:
- **トマリぐるぐる** (`guruguru.html` / `src/app.jsx`) — character turns to follow the mouse across 25 directions.
- **トマリトーク** (`talk.html` / `src/talk-app.jsx`) — adds mic/audio-file driven lip-sync on top of mouse-following.

Pure frontend, no backend. Vite multi-page build, deployed to GitHub Pages.

## Commands

```bash
npm run dev          # dev server at http://127.0.0.1:5173 (auto-opens /talk.html)
npm run build        # vite build → dist/
npm run preview      # serve dist/ at the Pages base path /tomari-guruguru/ (port 4173)
npm run verify:pages # validate dist/ against Pages expectations (run after build)
```

There are no tests and no linter. `npm run verify:pages` (see `scripts/verify-pages-build.mjs`) is the closest thing to a test — it asserts the built HTML uses the `/tomari-guruguru/` base path (not root `/assets/`), that referenced assets exist, and that each of the 6 sheets (`A`–`F`) under `dist/slices2/` contains exactly 25 `.webp` files. CI (`.github/workflows/pages.yml`) runs `build` then `verify:pages` on every PR/push to `main`; deploy only happens on `main`.

Node ^20.19 or >=22.12 is required (Vite 8 constraint). Mic input only works on `localhost` or HTTPS.

## Architecture

**Multi-page Vite app.** `vite.config.js` declares three HTML inputs (`index.html`, `guruguru.html`, `talk.html`). `index.html` is just a meta-refresh redirect to `talk.html`. The `base` is `/` in dev but `/tomari-guruguru/` in `build` — never hardcode asset paths; rely on Vite's base resolution and reference public assets relatively.

**The two apps load two module scripts, in order:** `src/tweaks-panel.jsx` then the app. This ordering is load-bearing — `tweaks-panel.jsx` defines the Tweaks UI components and `useTweaks`, then assigns them onto `window` (`Object.assign(window, {...})`). `app.jsx`/`talk-app.jsx` use `TweaksPanel`, `useTweaks`, `TweakSlider`, etc. as **globals without importing them**. If you add a Tweak control or rename one, update the `window` export list at the bottom of `tweaks-panel.jsx`.

**`src/character-config.js` is the single source of truth for character art.** It maps a sheet letter + (row, col) to an image path via `src(sheet, r, c)` → `slices2/<sheet>/r<r>c<c>.webp`. The 25 directions are a 5×5 grid (`r0`=look up … `r4`=look down; `c0`=left … `c4`=right). The 6 sheets are eye×mouth combinations: `A`/`B`/`C` = eyes open with mouth closed/half/open, `D`/`E`/`F` = eyes closed with the same mouth states. To swap characters, regenerate the slices and adjust `basePath`/`ext` here only.

**Rendering approach (both apps):** all frames for the current state are rendered as stacked absolutely-positioned `<img>`s; only the active one has `opacity: 1`. This preloads every frame so direction/mouth changes are instant with no flicker. A `requestAnimationFrame` loop smooths mouse target → grid cell. Auto-blink is a self-scheduling `setTimeout` chain with randomized intervals (single/double/slow blinks).

**talk-app audio engine** (`makeAudioEngine` in `src/talk-app.jsx`): a Web Audio `AnalyserContext` computes RMS level from mic and/or an `<audio>` element; the level (after gain + asymmetric attack/release envelope) is thresholded into 3 mouth stages (`thHalf`, `thFull`). Mouth switching is debounced (~70ms) to avoid jitter.

### The Tweaks panel / EDITMODE protocol

The floating "Tweaks" panel is a generic harness scaffold, not bespoke to this project. Two non-obvious things:

- Each app's tweak defaults live in a `/*EDITMODE-BEGIN*/{ ... }/*EDITMODE-END*/` JSON block. `setTweak` posts `__edit_mode_set_keys` to `window.parent`, and an external host is expected to rewrite that on-disk JSON block to persist changes. In a plain `npm run dev` session there is no such host, so tweak changes are in-memory only and reset on reload. Keep the block as valid JSON literal and keep the markers intact.
- `tweaks-panel.jsx` carries an `@ds-adherence-ignore` marker and uses raw hex/px by design — don't "fix" its styling to a design system.

## Character asset pipeline

`tools/slice_character_sheets.py` slices six 5×5 sheet PNGs (from `新キャラ資料/`) into the 150 individual `public/slices2/<A–F>/r#c#.webp` frames. It shells out to **ffmpeg/ffprobe** (must be on PATH). `public/slices2/` is committed; the source `sheets/`, `uploads/`, and `新キャラ資料/` directories are git-ignored. Full replacement workflow is in `docs/新キャラ差し替え手順.md`.

## License boundary

Code is MIT (`LICENSE`). Character images, slices, thumbnails, and audio are **not** MIT and are non-commercial only (`ASSET_LICENSE.md`). Don't relicense or reuse the assets outside this project.
