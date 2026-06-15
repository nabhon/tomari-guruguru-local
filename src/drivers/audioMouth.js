import React from 'react';
import { clamp } from '../engine/shared';

const { useState, useRef, useMemo, useCallback } = React;

// ---- 音声エンジン（マイクのみ） ----
function makeAudioEngine() {
  const st = { ctx: null, micAnalyser: null, micStream: null, buf: null };
  function ctx() {
    if (!st.ctx) st.ctx = new (window.AudioContext || window.webkitAudioContext)();
    return st.ctx;
  }
  function levelOf(analyser) {
    if (!analyser) return 0;
    if (!st.buf || st.buf.length !== analyser.fftSize) st.buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(st.buf);
    let sum = 0;
    for (let i = 0; i < st.buf.length; i++) sum += st.buf[i] * st.buf[i];
    return Math.sqrt(sum / st.buf.length);
  }
  return {
    async startMic() {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const c = ctx();
      await c.resume();
      const src = c.createMediaStreamSource(stream);
      const an = c.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      st.micStream = stream;
      st.micAnalyser = an;
    },
    stopMic() {
      if (st.micStream) st.micStream.getTracks().forEach((t) => t.stop());
      st.micStream = null;
      st.micAnalyser = null;
    },
    level() { return levelOf(st.micAnalyser); },
    micOn() { return !!st.micAnalyser; }
  };
}

// MouthSource: マイク音量から口段階(0|1|2)を求める。
// メインループの onFrame から frame(now, tw) を毎フレーム呼ぶ。エンベロープ追従・
// しきい値判定・70ms デバウンス・メータ表示をここに閉じ込める。
export function useAudioMouth(meterRef) {
  const [micOn, setMicOn] = useState(false);
  const [micErr, setMicErr] = useState('');

  const engine = useMemo(() => makeAudioEngine(), []);
  const env = useRef(0);
  const lastMouth = useRef(0);
  const lastSwitch = useRef(0);

  // 毎フレーム: 音量 → エンベロープ → 口段階。変化したら新しい段階を返す（無変化は null）。
  const frame = useCallback((now, tw) => {
    const raw = engine.level() * tw.micGain;
    if (raw > env.current) env.current += (raw - env.current) * 0.6;
    else env.current += (raw - env.current) * tw.release;
    if (meterRef.current) {
      meterRef.current.style.width = `${clamp(env.current / 0.4, 0, 1) * 100}%`;
    }
    const lv = env.current;
    const m = lv >= tw.thFull ? 2 : lv >= tw.thHalf ? 1 : 0;
    if (m !== lastMouth.current && now - lastSwitch.current > 70) {
      lastMouth.current = m;
      lastSwitch.current = now;
      return m;
    }
    return null;
  }, [engine, meterRef]);

  async function toggleMic() {
    setMicErr('');
    if (micOn) { engine.stopMic(); setMicOn(false); return; }
    try {
      await engine.startMic();
      setMicOn(true);
    } catch (e) {
      setMicErr("Can't access the mic (check permissions)");
    }
  }

  return { frame, toggleMic, micOn, micErr };
}
