# Character Replacement Guide & Notes

This memo describes the procedure for preventing the most common problems when swapping characters: "bleed-in from the neighboring character," "clipped hair," and "ragged transparent edges."

## Required assets

For a new character, prepare the following 6 sheets.

| Sheet | Eyes | Mouth | Example filename |
|---|---|---|---|
| A | Open | Closed | `A_目開け_口とじ.png` |
| B | Open | Half | `B_目開け_口中間.png` |
| C | Open | Open | `C_目開け_口開け.png` |
| D | Closed | Closed | `D_目閉じ_口とじ.png` |
| E | Closed | Half | `E_目閉じ_口中間.png` |
| F | Closed | Open | `F_目閉じ_口開け.png` |

Requirements:

- 4500×4500px transparent PNG
- 5×5 grid, each cell 900×900px
- Rows: looking up → looking down
  - `r0`: looking up
  - `r1`: slightly up
  - `r2`: front
  - `r3`: slightly down
  - `r4`: looking down
- Columns: facing left → facing right
  - `c0`: facing left
  - `c2`: front
  - `c4`: facing right
- Keep the character's position, angle, and body size identical across A–F
- Keep everything other than the eyes and mouth as identical as possible

## Important notes

### 1. Don't just cut at the 900px cell boundaries

Depending on the asset, parts of the hair, ponytail, or clothing may spill over into the adjacent 900px cell.

Simply doing a

```text
900×900 split into 25
```

cut causes the following problems:

- The neighboring character bleeds into the up-left / up-right cells
- The top of the hair or the ponytail gets clipped
- A lower-row character's head intrudes into an upper-row cell

For this reason, we now use the **component mode** of `tools/slice_character_sheets.py`.

This method detects per-character connected components across the whole sheet and assigns them to the 25 directions.

### 2. Watch out for semi-transparent gray-background residue

Even when the source PNG looks transparent, semi-transparent gray background can remain near the edges.

Symptoms:

- A faint gray square or line is visible around the character
- The edges look dirty against a black background or when using OBS chroma key

The current generation script uses `--remove-gray-residue` to remove low-saturation gray residue.

### 3. Final frame format of the published version

For the published Tomari version, the slice images are currently referenced in WebP format to reduce file size.

```text
{basePath}/{A-F}/r{row}c{col}.webp
```

This can be switched via `basePath` and `ext` in `src/character-config.js`.

## Generation procedure

Example: when the new-asset folder is `新キャラ資料`.

```powershell
python tools\slice_character_sheets.py `
  --source "新キャラ資料" `
  --sheets-out "sheets" `
  --uploads-out "uploads" `
  --slices-out "public/slices2" `
  --format webp `
  --jobs 4 `
  --component-mode `
  --min-component-area 80 `
  --alpha-threshold 64 `
  --remove-gray-residue
```

After generation, you get:

```text
public/slices2/A/r0c0.webp ... r4c4.webp
public/slices2/B/r0c0.webp ... r4c4.webp
...
public/slices2/F/r0c0.webp ... r4c4.webp
```

150 images in total.

## What to look for in the generation log

For each sheet, the following output means things are normal:

```text
components=xxxx large=25
row0 comps(area) 1:xxxxx 1:xxxxx 1:xxxxx 1:xxxxx 1:xxxxx
row1 comps(area) 1:xxxxx 1:xxxxx 1:xxxxx 1:xxxxx 1:xxxxx
...
row4 comps(area) 1:xxxxx 1:xxxxx 1:xxxxx 1:xxxxx 1:xxxxx
```

Things to confirm:

- `large=25`
- Every row's `comps(area)` is all `1:xxxxx`
  - This means exactly one character component is assigned per cell

Bad examples:

- `large=24` or `large=26`
- A `0:0` somewhere
- A `2:xxxxx` somewhere

In these cases, the cutout detection may have failed.

Adjustment candidates:

1. Best: adjust `--alpha-threshold`
   - Lots of residue: `80` or `96`
   - Thin hair disappears: `32` or `48`
2. Second-best: adjust `--min-component-area`
   - If small props or hair strands become separate components, use a smaller value
   - If it picks up noise, use a larger value
3. Not recommended: simple cell cut with `--no-component-mode`
   - Neighbor bleed-in and hair clipping tend to come back

## Verification you must always do

### 1. Count check

```powershell
foreach ($s in 'A','B','C','D','E','F') {
  $webp = (Get-ChildItem -Path (Join-Path 'public/slices2' $s) -Filter '*.webp' | Measure-Object).Count
  Write-Output "$s webp=$webp"
}
```

If they are all `25`, you're good.

### 2. Visually check representative frames

The minimum frames to look at:

```text
public/slices2/A/r0c0.webp  looking up-left
public/slices2/A/r0c4.webp  looking up-right
public/slices2/A/r2c2.webp  front
public/slices2/F/r0c0.webp  eyes closed, mouth open, up-left
public/slices2/F/r0c4.webp  eyes closed, mouth open, up-right
public/slices2/F/r2c2.webp  eyes closed, mouth open, front
```

Things to check:

- No neighboring character mixed in
- The top of the hair, the ponytail, and ear accessories are not clipped
- The feet / bottom of the clothing are not awkwardly cut off
- No gray squares or background residue
- No positional misalignment across A–F

### 3. Numeric inspection criteria

Reference values:

- Canvas: 1200×1200
- Character center X: about 600px
- Feet Y: 900px
- Outer-frame drift between A–F states: about 1px max
- Contact with canvas edges: none

## App-side check

The reference path for the slice images is centrally managed in `src/character-config.js`.

- `basePath`: base directory of the slice images (e.g. `slices2`)
- `ext`: image format (`webp` / `png`)
- `sheets`: sheet names for eyes open/closed × mouth closed/half/open

When swapping characters, just change `basePath` in `src/character-config.js` to the new slice directory.

## Local check

```powershell
npm run dev
```

Open in the browser:

```text
http://localhost:5173/talk.html
```

Things to check:

- The 25 directions switch naturally as the mouse follows
- The neighboring character does not appear in the up-left / up-right directions
- During lip-sync, the A/B/C and D/E/F positions don't jump
- The face position does not shift during blinking

## Recommended flow next time

1. Put the new character's 6 sheets in a dedicated folder
2. Confirm they are 4500×4500 RGBA with `ffprobe`
3. Run `tools/slice_character_sheets.py` in component mode
4. Confirm `large=25` and `1:xxxxx` for every cell in the log
5. Visually check the full 5×5 of A and F
6. Confirm center X / feet Y / edge contact via numeric inspection
7. Change `basePath` in `src/character-config.js` to the new slice directory
8. Verify actual behavior with `npm run dev`

Doing it in this order lets you catch cutout mistakes like the ones we had this time at an early stage.
