// キャラ生成ガイドの文面とプロンプト。
// GEN_PROMPT は ChatGPT Images に貼り付ける英語プロンプト。
// （日本語の原文は docs/01_画像生成用プロンプト.txt にある。）

// 画面に出すコピー用プロンプト（英語）
export const GEN_PROMPT = `Using the attached character reference image and the 5×5 face-angle template image, create a 5×5 face-angle reference sheet of the SAME character.

From the character reference, keep the hairstyle, hair length, bangs, hair accessories, eye shape, eye color, outfit, collar, ribbon, props, color palette, line art, shading, and art style as faithfully as possible.
From the 5×5 template, follow the face direction, angle, placement, size, margins, and grid layout of each cell.

The whole image is square. Place 25 head icons evenly in a 5-column × 5-row grid. Use a simple gray background.
Output a strict 1:1 square (e.g. 1024×1024 or larger). The 5×5 grid must fill the canvas edge-to-edge with equal cell sizes and equal outer margins, so the sheet can be cut into 25 identical cells (each cell = image width ÷ 5).

Framing rule for every cell (CRITICAL — the sheet is auto-sliced on the exact 5×5 grid, so anything crossing a boundary will be cut off):
- Center each head precisely in the middle of its own cell, both horizontally and vertically.
- Leave a clear, even safe-margin of empty space around each head — about 15–20% of the cell on every side (top, bottom, left, right).
- The head, hair, bangs, hair accessories, ears, and any props must stay FULLY inside their own cell. Nothing may touch, cross, clip, or overlap a cell boundary / gridline, and nothing may bleed into a neighboring cell. When in doubt, draw the head a little smaller so it never reaches the edges.
- Keep every head the same size and the same centered position so all 25 cells line up identically.

The attached template has a light 5×5 grid that marks the cell boundaries — use it only to align placement, sizing, and the safe margin. Do NOT draw any grid lines, borders, boxes, or frames in your output; the background must stay a clean flat gray.
Keep the same character, art style, line art, hairstyle, accessories, outfit, and colors throughout. Change only the face angle in each cell.

5×5 angle layout —
Columns (left → right): 1: facing left (profile), 2: 45° left, 3: front, 4: 45° right, 5: facing right (profile).
Rows (top → bottom): 1: strongly up, 2: slightly up, 3: level/horizontal, 4: slightly down, 5: strongly down.
Each cell combines its column's left/right angle with its row's up/down angle. e.g. top-left = "facing left + strongly up", center = "front + level", bottom-right = "facing right + strongly down".

Important: keep every face the same size, head scale, and placement balance. All faces should look about the same size; align the overall bounding box so no face is too big or too small.

Expression: eyes open and mouth closed in every cell. Avoid open mouths, big smiles, crying, angry faces, winks, closed eyes, and half-closed eyes. Keep a natural, cute, neutral expression throughout.

Do not: change to a different character; change the hairstyle, accessories, outfit, or eye color; change the expression much; draw the full body; make the background complex; add any text, numbers, logos, or watermarks; use a layout other than 5×5; repeat the same angle; make face sizes inconsistent; place a head off-center within its cell; or let any head, hair, accessory, or prop touch, cross, or overlap the cell boundaries / gridlines.

character head angle reference sheet, 5x5 grid, same character, same design, same hairstyle, same accessories, same outfit, same colors, eyes open, closed mouth, neutral cute expression, yaw and pitch matrix, consistent head scale, consistent face size, evenly spaced, centered in each cell, generous safe margin around each head, head fully inside its cell, not touching the gridlines, gray background, clean line art, no text, no logo, no extra objects.

────────────────────────────────
▶ STYLE (edit this line):  chibi anime, soft cel shading
   Replace the text after "STYLE:" with any look you want — e.g. "realistic semi-render", "watercolor", "flat minimal vector", "pixel art", "90s anime cel". Leave it as-is to keep the reference image's own style.
────────────────────────────────

n=3

----- Follow-up prompts for the eye / mouth variants -----
• Make the eyes closed in every position. Don't change anything except the eyes.
• Make every open mouth an "ah" wide-open mouth. Don't change anything except the mouth.
• Make every open mouth a small, slightly-open mouth. Don't change anything except the mouth.`;

// 画面に出す手順（英語）
export const GUIDE_STEPS = [
  'Prepare a clear reference image of your character.',
  'In ChatGPT (Images), attach the 5×5 template (shown above) and your reference, then paste the prompt below (Copy prompt) and generate the eyes-open / mouth-closed sheet.',
  'Use the follow-up lines at the end of the prompt to make the eyes-closed and mouth (half / open) variants — 6 sheets total: A eyes-open·closed, B open·half, C open·open, D closed·closed, E closed·half, F closed·open.',
  'Make each sheet a square image on a transparent background (optionally upscale). Keep the character scale/position identical across all 6.',
  'Back here: click “+ Add character”, pick the 6 sheets in the A–F slots, name it, and Create — the app slices them into 150 frames.',
];

// 簡易スライサーの注意（最高品質は Python ツール）
export const GUIDE_NOTE = 'In-app Add uses a simple 5×5 grid split — great for AI sheets made with this prompt. For tricky art (overflowing hair, gray-edge residue), tools/slice_character_sheets.py gives cleaner results.';
