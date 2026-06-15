import React from 'react';
import { cellFromXY } from './shared';

// 共有メインループ — 1本の requestAnimationFrame で平滑追従＋セル更新を回す。
// 方向ソース（マウス等）は targetRef.current = {x,y} を書き込み、ここがそれを
// なめらかに current へ寄せて 5×5 セルへ写像する。onFrame は同一フレーム内で
// 口ソース（音声等）が処理を差し込むための継ぎ目。
//
// onCell / onFrame は ref 経由で最新化し、effect を初回のみマウント（[]）させる。
// これにより talk 版の [engine] 再購読のような rAF 張り直しを避け、
// 常駐ループ1本という現状の挙動を保つ。
export function useAvatarLoop({ tweaksRef, targetRef, rows, cols, onCell, onFrame }) {
  const current = React.useRef({ x: 0, y: 0 });
  const onCellRef = React.useRef(onCell);
  onCellRef.current = onCell;
  const onFrameRef = React.useRef(onFrame);
  onFrameRef.current = onFrame;

  React.useEffect(() => {
    let raf;
    let last = { r: 2, c: 2 };
    function tick(now) {
      const tw = tweaksRef.current;
      const k = tw.smoothing;
      current.current.x += (targetRef.current.x - current.current.x) * k;
      current.current.y += (targetRef.current.y - current.current.y) * k;
      const cell = cellFromXY(current.current.x, current.current.y, rows, cols);
      if (cell.r !== last.r || cell.c !== last.c) {
        last = cell;
        onCellRef.current(cell);
      }
      if (onFrameRef.current) onFrameRef.current(now, tw);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tweaksRef, targetRef, rows, cols]);
}
