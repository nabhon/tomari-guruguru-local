// 設定の永続化 — userData/settings.json への極小 JSON ストア（外部依存なし）。
// 形: { talk: {...}, guruguru: {...}, window: { bounds } }
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

let cache = null;

function file() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    cache = {}; // 初回起動・破損時は空から
  }
  return cache;
}

function persist() {
  try {
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error('settings write failed:', e);
  }
}

// tweak チャンネル（'talk' / 'guruguru'）の保存値を返す
function getTweaks(key) {
  return load()[key] || {};
}

// 差分をマージして保存
function saveTweaks(key, edits) {
  const s = load();
  s[key] = { ...(s[key] || {}), ...edits };
  persist();
}

function getWindowBounds() {
  return load().window && load().window.bounds;
}

function saveWindowBounds(bounds) {
  const s = load();
  s.window = { ...(s.window || {}), bounds };
  persist();
}

module.exports = { getTweaks, saveTweaks, getWindowBounds, saveWindowBounds };
