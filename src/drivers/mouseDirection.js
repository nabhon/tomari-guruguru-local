import React from 'react';
import { clamp } from '../engine/shared';

// DirectionSource: マウス追従。ポインタ位置をキャラ中心からの相対 -1..1 に変換し
// targetRef.current = {x, y} へ書き込む。平滑化・グリッド写像は useAvatarLoop が担う。
export function useMouseDirection({ charRef, tweaksRef, targetRef }) {
  React.useEffect(() => {
    function onMove(e) {
      const el = charRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height * 0.45;
      const range = tweaksRef.current.followRange;
      targetRef.current.x = clamp((e.clientX - cx) / range, -1, 1);
      targetRef.current.y = clamp((e.clientY - cy) / range, -1, 1);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
    };
  }, [charRef, tweaksRef, targetRef]);
}
