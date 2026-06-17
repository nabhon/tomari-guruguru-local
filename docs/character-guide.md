# Character creation guide

How to make a new character for トマリトーク. The avatar turns to follow the
mouse/face across a **5×3 grid = 15 directions** (5 up/down rows × 3 left/right
columns), with separate sheets for eye and mouth states.

## The grid

- **Columns (left → right):** `c0` = 45° left, `c1` = front, `c2` = 45° right.
- **Rows (top → bottom):** `r0` strongly up, `r1` slightly up, `r2` level,
  `r3` slightly down, `r4` strongly down.
- Each cell is one head at the column's left/right angle combined with the row's
  up/down angle. 5 × 3 = **15 cells per sheet**.

Why only 3 columns: the extreme left/right profiles are rarely hit by mouse/face
follow, and dropping them frees horizontal room so each remaining head can be drawn
**larger and more detailed**.

## The 6 sheets (A–F)

Each character is 6 sheets — every eye state × every mouth state — each a full 5×3
angle grid:

| Sheet | Eyes   | Mouth  |
|-------|--------|--------|
| A     | open   | closed |
| B     | open   | half   |
| C     | open   | open   |
| D     | closed | closed |
| E     | closed | half   |
| F     | closed | open   |

6 sheets × 15 cells = **90 frames** total. Sliced frames live at
`public/slices2/<A–F>/r#c#.webp` (built-in トマリ) or, for added characters, in a
`characters/<name>/<A–F>/r#c#.webp` folder next to the app.

## Generating the sheets (ChatGPT Images)

1. Prepare a clear reference image of your character.
2. Attach the **5×3 template** (`public/guide/template.png`, also downloadable from
   the in-app "How to make" popup) and your reference, then paste the prompt and
   generate sheet **A** (eyes open, mouth closed).
3. Use the follow-up lines at the end of the prompt to derive the eyes-closed and
   mouth half/open variants (sheets B–F).
4. Export each sheet as a **3:5 portrait** image (e.g. 900×1500) on a transparent
   background. Keep the character scale and position identical across all 6 so the
   frames line up.

The two prompts (standard and the 3-image art-style variant) are the single source of
truth in [`src/character-guide.js`](../src/character-guide.js) — `GEN_PROMPT` and
`GEN_PROMPT_STYLE`. The in-app popup copies them verbatim.

### Framing rules that matter

The sheet is auto-sliced on the exact 5×3 grid, so anything crossing a cell boundary
gets cut off. Keep each head centered in its cell with a 12–18% safe margin on all
sides, every head the same size, and nothing bleeding into a neighbor.

## Slicing into frames

Two paths produce the 90 `r#c#.webp` frames:

- **In-app "+ Add character"** (Electron + `npm run dev`): pick the 6 sheets in the
  A–F slots, name it, Create. This does a simple 5×3 grid split (`width ÷ 3` ×
  `height ÷ 5`) — ideal for clean AI sheets made with the prompt above.
- **`tools/slice_character_sheets.py`** (high-fidelity): connected-component
  extraction and gray-residue removal for tricky art (overflowing hair, gray edges).
  Requires `ffmpeg`/`ffprobe` on PATH. Expects a 3:5 sheet (`--cell` wide × `--cell`
  tall cells, 3 columns × 5 rows).

## App side

`src/character-config.js` is the source of truth for the grid (`rows: 5, cols: 3`) and
the frame path pattern. Nothing else needs editing to swap characters — discovery is
automatic (built-in `slices2`, dev middleware, or Electron `characters/` folder).
