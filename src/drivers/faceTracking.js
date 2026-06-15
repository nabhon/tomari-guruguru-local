import React from 'react';
import { clamp } from '../engine/shared';

const { useState, useRef, useCallback, useEffect } = React;

// FaceSource — Webカメラ1台＋MediaPipe FaceLandmarker 1ループで方向/口/まばたきを駆動する。
// types.js が想定した「複数チャンネルを束ねるソース」。1回の推論から:
//   - facialTransformationMatrix → 頭の yaw/pitch → targetRef.current = {x,y}（方向）
//   - blendshapes.jawOpen        → 口段階 0|1|2（frameMouth, audioMouth と同形）
//   - blendshapes.eyeBlink*      → まばたき boolean（blink）
// 推論は WASM でこの端末内だけで動く（外部送信なし）。アセットは public/mediapipe に同梱し
// import.meta.env.BASE_URL 経由で読むので dev/Pages/electron すべてで解決する。
//
//   useFaceTracking({ tweaksRef, targetRef })
//     → { start, stop, calibrate, cameraOn, error, videoRef, frameMouth, blink }

// 列優先 4x4 行列の回転部からおおまかな yaw / pitch（ラジアン）を得る。
// 顔ローカルの +Z 軸（3列目）の向きから算出。中立を引いて使うので厳密な
// オイラー分解は不要（中心付近で単調・ほぼ線形であれば十分）。
function poseFromMatrix(data) {
  // data[col*4 + row]。3列目 = ローカルZ軸のカメラ空間での向き。
  const zx = data[8], zy = data[9], zz = data[10];
  const yaw = Math.atan2(zx, zz);
  const pitch = Math.atan2(zy, Math.hypot(zx, zz));
  return { yaw, pitch };
}

function scoreOf(categories, name) {
  if (!categories) return 0;
  for (const c of categories) if (c.categoryName === name) return c.score;
  return 0;
}

export function useFaceTracking({ tweaksRef, targetRef }) {
  const [cameraOn, setCameraOn] = useState(false);
  const [error, setError] = useState('');
  const [blink, setBlink] = useState(false);

  const videoRef = useRef(null);
  const landmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const runningRef = useRef(false);
  const rafRef = useRef(0);

  const neutralRef = useRef({ yaw: 0, pitch: 0 });
  const needNeutralRef = useRef(false);   // start 後の最初の検出で中立を自動取得
  const poseRef = useRef({ yaw: 0, pitch: 0 });
  const jawRef = useRef(0);
  const blinkRef = useRef(false);

  // 口デバウンス（audioMouth と同じ ~70ms）
  const lastMouth = useRef(0);
  const lastSwitch = useRef(0);

  // 検出結果を各チャンネルへ反映
  const handleResult = useCallback((res) => {
    const mat = res.facialTransformationMatrixes && res.facialTransformationMatrixes[0];
    const bs = res.faceBlendshapes && res.faceBlendshapes[0];
    if (mat && mat.data) {
      const p = poseFromMatrix(mat.data);
      poseRef.current = p;
      if (needNeutralRef.current) { neutralRef.current = { ...p }; needNeutralRef.current = false; }
      const tw = tweaksRef.current;
      const sens = tw.faceSensitivity;
      let nx = (p.yaw - neutralRef.current.yaw) * sens;
      let ny = (p.pitch - neutralRef.current.pitch) * sens;
      if (tw.faceInvertX) nx = -nx;
      if (tw.faceInvertY) ny = -ny;
      targetRef.current.x = clamp(nx, -1, 1);
      targetRef.current.y = clamp(ny, -1, 1);
    }
    if (bs && bs.categories) {
      jawRef.current = scoreOf(bs.categories, 'jawOpen');
      // まばたき: 左右の大きい方 + ヒステリシスでチャタリング防止
      const eye = Math.max(scoreOf(bs.categories, 'eyeBlinkLeft'), scoreOf(bs.categories, 'eyeBlinkRight'));
      if (!blinkRef.current && eye > 0.5) { blinkRef.current = true; setBlink(true); }
      else if (blinkRef.current && eye < 0.3) { blinkRef.current = false; setBlink(false); }
    }
  }, [tweaksRef, targetRef]);

  // 口チャンネル: メインループの onFrame から呼ばれる。jawOpen をしきい値判定（無変化は null）。
  const frameMouth = useCallback((now, tw) => {
    const lv = jawRef.current;
    const m = lv >= tw.jawFull ? 2 : lv >= tw.jawHalf ? 1 : 0;
    if (m !== lastMouth.current && now - lastSwitch.current > 70) {
      lastMouth.current = m;
      lastSwitch.current = now;
      return m;
    }
    return null;
  }, []);

  const calibrate = useCallback(() => { neutralRef.current = { ...poseRef.current }; }, []);

  const detectLoop = useCallback(() => {
    const v = videoRef.current;
    const lm = landmarkerRef.current;
    if (runningRef.current && v && lm && v.readyState >= 2) {
      try {
        const res = lm.detectForVideo(v, performance.now());
        handleResult(res);
      } catch { /* 一時的な失敗は無視 */ }
    }
    // requestVideoFrameCallback があれば動画FPSで（自然に ~30fps へ間引き）、
    // 無ければ rAF（33ms スロットルは detectForVideo 内のタイムスタンプ管理に任せる）
    if (!runningRef.current) return;
    if (v && v.requestVideoFrameCallback) rafRef.current = v.requestVideoFrameCallback(() => detectLoop());
    else rafRef.current = requestAnimationFrame(() => detectLoop());
  }, [handleResult]);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (videoRef.current && videoRef.current.cancelVideoFrameCallback && rafRef.current) {
      try { videoRef.current.cancelVideoFrameCallback(rafRef.current); } catch {}
    }
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (landmarkerRef.current) { try { landmarkerRef.current.close(); } catch {} landmarkerRef.current = null; }
    blinkRef.current = false; setBlink(false);
    setCameraOn(false);
  }, []);

  const start = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      streamRef.current = stream;
      const v = videoRef.current;
      v.srcObject = stream;
      v.muted = true; v.playsInline = true;
      await v.play();

      if (!landmarkerRef.current) {
        const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
        const base = import.meta.env.BASE_URL;
        const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);
        const opts = (delegate) => ({
          baseOptions: { modelAssetPath: `${base}mediapipe/face_landmarker.task`, delegate },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        });
        try {
          landmarkerRef.current = await FaceLandmarker.createFromOptions(fileset, opts('GPU'));
        } catch {
          landmarkerRef.current = await FaceLandmarker.createFromOptions(fileset, opts('CPU'));
        }
      }

      needNeutralRef.current = true; // 最初の検出フレームで中立を自動取得
      runningRef.current = true;
      setCameraOn(true);
      detectLoop();
    } catch (e) {
      stop();
      setError('カメラを使用できません（権限・接続を確認してください）');
    }
  }, [detectLoop, stop]);

  // アンマウント時に確実に停止
  useEffect(() => () => stop(), [stop]);

  return { start, stop, calibrate, cameraOn, error, videoRef, frameMouth, blink };
}
