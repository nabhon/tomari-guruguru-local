// MediaPipe アセットを public/mediapipe/ に用意する一度きりのセットアップ。
//   - WASM ランタイムを node_modules からコピー
//   - FaceLandmarker モデル (face_landmarker.task, float16) をダウンロード
// 出力はコミットされ、ビルド時に Vite が dist/ へコピーする。オフライン
// （デスクトップ版 file://）で顔追跡を動かすために同梱する。
//
//   node scripts/fetch-mediapipe.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const srcWasm = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const outDir = path.join(root, 'public', 'mediapipe');
const outWasm = path.join(outDir, 'wasm');

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const modelPath = path.join(outDir, 'face_landmarker.task');

fs.mkdirSync(outWasm, { recursive: true });

// 1) WASM ランタイムをコピー
if (!fs.existsSync(srcWasm)) {
  console.error('node_modules の @mediapipe/tasks-vision/wasm が見つかりません。先に `npm install` を実行してください。');
  process.exit(1);
}
// FilesetResolver.forVisionTasks が読むのは SIMD 版とその非SIMDフォールバックのみ。
// module_internal 版（GraphRunner 用・約11MB）は使わないので同梱しない。
const WASM_FILES = [
  'vision_wasm_internal.js', 'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm',
];
// 以前のフル同梱で残った不要ファイルを掃除
for (const f of fs.existsSync(outWasm) ? fs.readdirSync(outWasm) : []) {
  if (!WASM_FILES.includes(f)) fs.rmSync(path.join(outWasm, f));
}
for (const f of WASM_FILES) {
  const from = path.join(srcWasm, f);
  if (!fs.existsSync(from)) { console.error(`WASM が見つかりません: ${f}`); process.exit(1); }
  fs.copyFileSync(from, path.join(outWasm, f));
}
console.log(`WASM ${WASM_FILES.length} ファイルを ${path.relative(root, outWasm)} へコピーしました`);

// 2) モデルをダウンロード（既にあればスキップ）
if (fs.existsSync(modelPath) && fs.statSync(modelPath).size > 0) {
  console.log(`モデルは既に存在します: ${path.relative(root, modelPath)}（スキップ）`);
} else {
  console.log(`モデルをダウンロード中: ${MODEL_URL}`);
  const res = await fetch(MODEL_URL);
  if (!res.ok) {
    console.error(`ダウンロード失敗: HTTP ${res.status}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(modelPath, buf);
  console.log(`保存しました: ${path.relative(root, modelPath)}（${(buf.length / 1024 / 1024).toFixed(1)} MB）`);
}

console.log('完了。');
