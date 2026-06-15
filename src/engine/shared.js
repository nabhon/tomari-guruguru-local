// 共有ヘルパー — 入力ソースに依存しない純粋関数
// app.jsx / talk-app.jsx の重複ロジックをここに集約

// 値を [a, b] にクランプ
export function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

// 背景色プリセット（最後の #2B2926 はダークテーマ）
export const BG_OPTIONS = ['#FFF8EE', '#FDEFEF', '#EEF4FB', '#2B2926'];

// 平滑化後の -1..1 座標を 5×5 グリッドのセルへ写像
export function cellFromXY(x, y, rows, cols) {
  const c = clamp(Math.round((x + 1) / 2 * (cols - 1)), 0, cols - 1);
  const r = clamp(Math.round((y + 1) / 2 * (rows - 1)), 0, rows - 1);
  return { r, c };
}

// 背景色から派生するテーマ色（各アプリは必要な分だけ分割代入する）
export function themeColors(bgColor) {
  const dark = bgColor === '#2B2926';
  return {
    dark,
    inkColor: dark ? 'rgba(255,248,238,0.85)' : 'rgba(60,48,38,0.8)',
    subColor: dark ? 'rgba(255,248,238,0.45)' : 'rgba(60,48,38,0.45)',
    panelBg: dark ? 'rgba(48,45,42,0.92)' : 'rgba(255,255,255,0.88)',
    lineColor: dark ? 'rgba(255,248,238,0.14)' : 'rgba(60,48,38,0.12)',
  };
}
