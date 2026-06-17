import React from 'react';
import { clamp } from '../engine/shared';

// DirectionSource: マウス追従。ポインタ位置をキャラ中心からの相対 -1..1 に変換し
// targetRef.current = {x, y} へ書き込む。平滑化・グリッド写像は useAvatarLoop が担う。
// enabled=false の間は書き込まない（顔追跡など別ソースが方向を握っているとき用）。
// globalCursor=true（Electron のみ）のときは、メインプロセスが送るコンテンツ領域基準の
// 相対座標を同じ writeTarget で処理し、ウィンドウ非フォーカス時でも OS カーソルを追う。
export function useMouseDirection({ charRef, tweaksRef, targetRef, enabledRef, globalCursor }) {
  // clientX/clientY（または相当のコンテンツ領域基準座標）→ 相対ターゲットへ。
  const writeTarget = React.useCallback((clientX, clientY) => {
    if (enabledRef && enabledRef.current === false) return;
    const el = charRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height * 0.45;
    const range = tweaksRef.current.followRange;
    targetRef.current.x = clamp((clientX - cx) / range, -1, 1);
    targetRef.current.y = clamp((clientY - cy) / range, -1, 1);
  }, [charRef, tweaksRef, targetRef, enabledRef]);

  React.useEffect(() => {
    const onMove = (e) => writeTarget(e.clientX, e.clientY);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
    };
  }, [writeTarget]);

  // グローバルカーソル追従（Electron のみ）。フォーカス時はポインタイベントと同じ
  // 座標が両方届くが内容は一致するので競合しない。
  React.useEffect(() => {
    const d = typeof window !== 'undefined' ? window.tomariDesktop : null;
    if (!globalCursor || !d || !d.onGlobalCursor) return;
    d.setGlobalCursor(true);
    const off = d.onGlobalCursor((p) => writeTarget(p.x, p.y));
    return () => {
      if (off) off();
      d.setGlobalCursor(false);
    };
  }, [globalCursor, writeTarget]);
}
