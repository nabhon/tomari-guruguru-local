// キャラクター素材の探索とデフォルト生成。
// 各キャラは characters/<name>/<A-F>/r#c#.webp（同梱 slices2 と同じ構成）。
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

// characters/ の場所:
//  - パッケージ版: ポータブル .exe と同じフォルダ（PORTABLE_EXECUTABLE_DIR）。無ければ exe の隣。
//  - 開発時(electron:dev): プロジェクト直下（dev サーバーが見るのと同じ characters/）。
function charactersDir() {
  const base = app.isPackaged
    ? (process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe')))
    : path.join(__dirname, '..');
  return path.join(base, 'characters');
}

// デフォルト生成のコピー元（同梱スライス）
function bundledSlices() {
  return app.isPackaged
    ? path.join(__dirname, '..', 'dist', 'slices2')
    : path.join(__dirname, '..', 'public', 'slices2');
}

// A/ サブフォルダを持てばキャラとみなす（緩い検証）
function isCharacter(dir) {
  try { return fs.statSync(path.join(dir, 'A')).isDirectory(); } catch { return false; }
}

function listCharacters() {
  const dir = charactersDir();
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && isCharacter(path.join(dir, e.name)))
      .map((e) => e.name);
  } catch { return []; }
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// characters/ が無い／キャラが1つも無ければ、同梱トマリをデフォルトとして作る
function ensureDefaultCharacter() {
  const dir = charactersDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (listCharacters().length > 0) return;
    const src = bundledSlices();
    if (fs.existsSync(src)) copyDir(src, path.join(dir, 'Tomari'));
  } catch (e) {
    console.error('ensureDefaultCharacter failed:', e);
  }
}

// キャラ名の検証（パス区切り・危険文字・.. を弾く）
function validName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 64
    && !/[\\/:*?"<>|]/.test(name) && name !== '.' && name !== '..';
}

// 6シートからスライス済みの 150 フレームを characters/<name>/ に書き出す。
// files: [{ path: 'A/r0c0.webp', data: ArrayBuffer|Uint8Array|Buffer }]
function createCharacter(name, files) {
  if (!validName(name)) return { ok: false, error: 'invalid name' };
  const dir = charactersDir();
  const target = path.join(dir, name);
  if (fs.existsSync(target)) return { ok: false, error: 'exists' };
  try {
    for (const f of files) {
      const rel = String(f.path).replace(/\\/g, '/');
      if (rel.includes('..') || rel.startsWith('/')) continue; // 念のため
      const out = path.join(target, rel);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, Buffer.from(f.data));
    }
    return { ok: true };
  } catch (e) {
    console.error('createCharacter failed:', e);
    return { ok: false, error: 'write failed' };
  }
}

// tomari-char://chars/<name>/<sheet>/<file> → 実ファイルパス（.. による脱出は拒否）
function resolveCharFile(urlStr) {
  let rel;
  try { rel = decodeURIComponent(new URL(urlStr).pathname).replace(/^\/+/, ''); }
  catch { return null; }
  const dir = charactersDir();
  const file = path.normalize(path.join(dir, rel));
  if (file !== dir && !file.startsWith(dir + path.sep)) return null;
  return file;
}

module.exports = { charactersDir, listCharacters, ensureDefaultCharacter, resolveCharFile, createCharacter };
