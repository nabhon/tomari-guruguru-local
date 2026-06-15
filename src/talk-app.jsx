import React from 'react';
import ReactDOM from 'react-dom/client';
import charConfig from './character-config';
import { BG_OPTIONS, clamp, themeColors } from './engine/shared';
import { useAvatarLoop } from './engine/useAvatarLoop';
import { useMouseDirection } from './drivers/mouseDirection';
import { useAudioMouth } from './drivers/audioMouth';
import { useBlinkTimer } from './drivers/blinkTimer';
import { useFaceTracking } from './drivers/faceTracking';

const { useState, useRef, useMemo, useEffect } = React;

const TALK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "followRange": 340,
  "smoothing": 0.3,
  "charSize": 64,
  "bgColor": "#FFF8EE",
  "greenscreen": false,
  "chromaColor": "#00B140",
  "micGain": 1.6,
  "thHalf": 0.07,
  "thFull": 0.2,
  "release": 0.12,
  "autoBlink": true,
  "faceSensitivity": 2.5,
  "faceInvertX": true,
  "faceInvertY": false,
  "mouthFromFace": false,
  "blinkFromFace": false,
  "jawHalf": 0.15,
  "jawFull": 0.4,
  "faceBrightness": 1,
  "faceContrast": 1,
  "facePreview": true,
  "faceResolution": "480",
  "faceMinDetection": 0.5,
  "faceMinPresence": 0.5,
  "faceMinTracking": 0.5
}/*EDITMODE-END*/;

// クロマキー用の単色プリセット（緑 / 青 / マゼンタ）
const CHROMA_OPTIONS = ['#00B140', '#0047BB', '#FF00FF'];

const { rows: ROWS, cols: COLS } = charConfig;
// シート: 目開け×口[とじ/中間/開け] = A/B/C, 目閉じ×口[とじ/中間/開け] = D/E/F
const SHEETS = [
  charConfig.sheets.eyesOpen.close,   // A
  charConfig.sheets.eyesOpen.half,    // B
  charConfig.sheets.eyesOpen.open,    // C
  charConfig.sheets.eyesClosed.close, // D
  charConfig.sheets.eyesClosed.half,  // E
  charConfig.sheets.eyesClosed.open,  // F
];
const sheetFor = (eyesClosed, mouth) => SHEETS[(eyesClosed ? 3 : 0) + mouth];
const SRC = (sheet, r, c) => charConfig.src(sheet, r, c);

function App() {
  const [t, setTweak] = useTweaks(TALK_DEFAULTS);
  const [cell, setCell] = useState({ r: 2, c: 2 });
  const [mouth, setMouth] = useState(0);        // 0:とじ 1:中間 2:開け
  // UI を隠してキャラだけ表示（キャプチャ用）。永続化しない＝起動時は常に表示。
  const [hideUI, setHideUI] = useState(false);

  const charRef = useRef(null);
  const meterRef = useRef(null);
  const target = useRef({ x: 0, y: 0 });
  const tweaksRef = useRef(t);
  tweaksRef.current = t;

  // 入力ソース: 方向＝マウス／顔、口＝音声／顔、まばたき＝タイマー／顔。
  // 顔カメラが ON の間は顔が方向を握り、マウスは書き込みを止める。
  const audio = useAudioMouth(meterRef);
  const face = useFaceTracking({ tweaksRef, targetRef: target });
  const mouseEnabled = useRef(true);
  mouseEnabled.current = !face.cameraOn;
  useMouseDirection({ charRef, tweaksRef, targetRef: target, enabledRef: mouseEnabled });

  // 口・まばたきは「顔から」かつカメラONのときだけ顔ソースへ切替（OFF時は従来どおり）
  const faceBlink = t.blinkFromFace && face.cameraOn;
  const timerBlink = useBlinkTimer(t.autoBlink && !faceBlink);
  const blink = faceBlink ? face.blink : timerBlink;

  // メインループ1本で 追従 + 口段階（音声 or 顔）を回す
  useAvatarLoop({
    tweaksRef, targetRef: target, rows: ROWS, cols: COLS,
    onCell: setCell,
    onFrame: (now, tw) => {
      const m = (tw.mouthFromFace && face.cameraOn) ? face.frameMouth(now, tw) : audio.frame(now, tw);
      if (m != null) setMouth(m);
    },
  });

  // 解像度変更 → ストリーム再取得（モデル維持）。信頼度しきい値変更 → モデル再生成（ストリーム維持）。
  // どちらもカメラOFF時は no-op。
  useEffect(() => { face.applyCamera(); }, [t.faceResolution]);
  useEffect(() => { face.applyDetection(); }, [t.faceMinDetection, t.faceMinPresence, t.faceMinTracking]);

  // UI 表示/非表示トグル: F9（web/desktop 共通）＋ Electron の 表示メニュー
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'F9') { e.preventDefault(); setHideUI((v) => !v); } };
    window.addEventListener('keydown', onKey);
    const off = window.tomariDesktop && window.tomariDesktop.onToggleUI
      ? window.tomariDesktop.onToggleUI(() => setHideUI((v) => !v))
      : null;
    return () => {
      window.removeEventListener('keydown', onKey);
      if (off) off();
    };
  }, []);

  const allFrames = useMemo(() => {
    const arr = [];
    for (const s of SHEETS) for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) arr.push({ s, r, c });
    return arr;
  }, []);
  const activeSheet = sheetFor(blink, mouth);

  const { inkColor, subColor, panelBg, lineColor } = themeColors(t.bgColor);

  // 実際に描画する背景: グリーンバック時はクロマ単色、通常時はテーマ背景色
  const bg = t.greenscreen ? t.chromaColor : t.bgColor;

  const sizeVmin = t.charSize * 4 / 3;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: bg,
      overflow: 'hidden', transition: 'background 0.4s ease',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'crosshair', fontFamily: "'Zen Maru Gothic', sans-serif"
    }}>
      <div ref={charRef} className="bob" style={{
        position: 'relative',
        width: `${sizeVmin}vmin`, height: `${sizeVmin}vmin`,
        maxWidth: 1200, maxHeight: 1200,
        userSelect: 'none', touchAction: 'none'
      }}>
        {allFrames.map(({ s, r, c }) => (
          <img key={`${s}${r}${c}`} src={SRC(s, r, c)} alt="" draggable="false" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            opacity: s === activeSheet && r === cell.r && c === cell.c ? 1 : 0,
            pointerEvents: 'none'
          }}></img>
        ))}
      </div>

      {/* 顔追跡用の隠し映像。UI 非表示中も追跡を続けるため hideUI の外に置く。 */}
      <video ref={face.videoRef} muted playsInline style={{ display: 'none' }}></video>
      {/* 明度/コントラスト適用＋プレビュー兼用の canvas。常にマウントして描画し続け（検出に使う）、
          表示だけを切り替える。プレビューは自撮り感のため CSS で左右反転（検出画素には無影響）。 */}
      <canvas ref={face.canvasRef} style={{
        position: 'absolute', bottom: 20, left: 20, width: 160, borderRadius: 10,
        border: `1px solid ${lineColor}`, transform: 'scaleX(-1)', pointerEvents: 'none',
        boxShadow: '0 6px 24px rgba(60,48,38,0.16)',
        display: (face.cameraOn && t.facePreview && !hideUI) ? 'block' : 'none'
      }}></canvas>

      {!hideUI && (<>
      <div style={{ position: 'absolute', top: '3.5vh', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ fontSize: 'clamp(18px, 2.4vmin, 26px)', fontWeight: 700, color: inkColor, letterSpacing: '0.18em' }}>トマリトーク</div>
        <div style={{ fontSize: 'clamp(12px, 1.6vmin, 16px)', color: subColor, marginTop: 4, letterSpacing: '0.08em' }}>音声に合わせて口パク・まばたきするよ</div>
      </div>

      <div style={{
        position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 14,
        background: panelBg, backdropFilter: 'blur(10px)',
        border: `1px solid ${lineColor}`, borderRadius: 18,
        padding: '12px 18px', cursor: 'default',
        boxShadow: '0 6px 24px rgba(60,48,38,0.10)'
      }}>
        <button onClick={audio.toggleMic} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: 'inherit', fontWeight: 700, fontSize: 14,
          color: audio.micOn ? '#fff' : inkColor,
          background: audio.micOn ? '#D96C4F' : 'transparent',
          border: `1.5px solid ${audio.micOn ? '#D96C4F' : lineColor}`,
          borderRadius: 12, padding: '9px 16px', cursor: 'pointer',
          minHeight: 44
        }}>
          <span style={{
            width: 9, height: 9, borderRadius: '50%',
            background: audio.micOn ? '#fff' : '#D96C4F',
            animation: audio.micOn ? 'pulse 1.2s ease-in-out infinite' : 'none'
          }}></span>
          {audio.micOn ? 'マイク停止' : 'マイク開始'}
        </button>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontWeight: 700, fontSize: 14, color: inkColor,
          border: `1.5px solid ${lineColor}`, borderRadius: 12,
          padding: '9px 16px', cursor: 'pointer', minHeight: 44, boxSizing: 'border-box'
        }}>
          ♪ 音声ファイル
          <input type="file" accept="audio/*" onChange={audio.onFilePick} style={{ display: 'none' }}></input>
        </label>

        <button onClick={() => (face.cameraOn ? face.stop() : face.start())} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: 'inherit', fontWeight: 700, fontSize: 14,
          color: face.cameraOn ? '#fff' : inkColor,
          background: face.cameraOn ? '#4F86D9' : 'transparent',
          border: `1.5px solid ${face.cameraOn ? '#4F86D9' : lineColor}`,
          borderRadius: 12, padding: '9px 16px', cursor: 'pointer',
          minHeight: 44
        }}>
          <span style={{
            width: 9, height: 9, borderRadius: '50%',
            background: face.cameraOn ? '#fff' : '#4F86D9',
            animation: face.cameraOn ? 'pulse 1.2s ease-in-out infinite' : 'none'
          }}></span>
          {face.cameraOn ? '顔カメラ停止' : '顔カメラ開始'}
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 150 }}>
          <div style={{ fontSize: 11, color: subColor, letterSpacing: '0.06em', display: 'flex', justifyContent: 'space-between' }}>
            <span>音量</span>
            <span>{['とじ', 'はんびらき', 'ぜんかい'][mouth]}</span>
          </div>
          <div style={{ position: 'relative', height: 10, borderRadius: 5, background: lineColor, overflow: 'hidden' }}>
            <div ref={meterRef} style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: '0%',
              borderRadius: 5, background: 'linear-gradient(90deg, #8FBC8F, #E8B04B, #D96C4F)'
            }}></div>
            <div style={{ position: 'absolute', top: 0, bottom: 0, width: 2, background: inkColor, opacity: 0.5, left: `${clamp(t.thHalf / 0.4, 0, 1) * 100}%` }}></div>
            <div style={{ position: 'absolute', top: 0, bottom: 0, width: 2, background: inkColor, opacity: 0.5, left: `${clamp(t.thFull / 0.4, 0, 1) * 100}%` }}></div>
          </div>
        </div>
      </div>
      {audio.micErr ? (
        <div style={{ position: 'absolute', bottom: 92, left: '50%', transform: 'translateX(-50%)', color: '#B3261E', fontSize: 13, fontWeight: 700 }}>{audio.micErr}</div>
      ) : null}
      {face.error ? (
        <div style={{ position: 'absolute', bottom: 116, left: '50%', transform: 'translateX(-50%)', color: '#B3261E', fontSize: 13, fontWeight: 700 }}>{face.error}</div>
      ) : null}
      {face.cameraOn ? (
        <div style={{ position: 'absolute', bottom: 92, left: '50%', transform: 'translateX(-50%)', color: subColor, fontSize: 12 }}>顔追跡は端末内だけで処理されます（送信なし）</div>
      ) : null}
      <audio ref={audio.audioElRef} controls style={{
        position: 'absolute', bottom: 20, right: 20, width: 260,
        display: audio.fileName ? 'block' : 'none', cursor: 'default'
      }}></audio>

      <TweaksPanel>
        <TweakSection label="Lip sync"></TweakSection>
        <TweakSlider label="Mic sensitivity" value={t.micGain} min={0.3} max={5} step={0.1}
          onChange={(v) => setTweak('micGain', v)}></TweakSlider>
        <TweakSlider label="Threshold (half open)" value={t.thHalf} min={0.01} max={0.3} step={0.005}
          onChange={(v) => setTweak('thHalf', v)}></TweakSlider>
        <TweakSlider label="Threshold (full open)" value={t.thFull} min={0.05} max={0.4} step={0.005}
          onChange={(v) => setTweak('thFull', v)}></TweakSlider>
        <TweakSlider label="Mouth close speed" value={t.release} min={0.03} max={0.4} step={0.01}
          onChange={(v) => setTweak('release', v)}></TweakSlider>
        <TweakToggle label="Auto blink" value={t.autoBlink}
          onChange={(v) => setTweak('autoBlink', v)}></TweakToggle>
        <TweakSection label="Motion"></TweakSection>
        <TweakSlider label="Follow range" value={t.followRange} min={120} max={1200} step={10} unit="px"
          onChange={(v) => setTweak('followRange', v)}></TweakSlider>
        <TweakSlider label="Follow speed" value={t.smoothing} min={0.04} max={0.5} step={0.01}
          onChange={(v) => setTweak('smoothing', v)}></TweakSlider>
        <TweakSection label="Appearance"></TweakSection>
        <TweakSlider label="Character size" value={t.charSize} min={30} max={92} unit="vmin"
          onChange={(v) => setTweak('charSize', v)}></TweakSlider>
        <TweakColor label="Background" value={t.bgColor} options={BG_OPTIONS}
          onChange={(v) => setTweak('bgColor', v)}></TweakColor>
        <TweakSection label="Output"></TweakSection>
        <TweakToggle label="Greenscreen background" value={t.greenscreen}
          onChange={(v) => setTweak('greenscreen', v)}></TweakToggle>
        <TweakColor label="Chroma color" value={t.chromaColor} options={CHROMA_OPTIONS}
          onChange={(v) => setTweak('chromaColor', v)}></TweakColor>
        <TweakToggle label="Hide UI (F9)" value={hideUI}
          onChange={(v) => setHideUI(v)}></TweakToggle>
        <TweakSection label="Face camera"></TweakSection>
        <TweakSlider label="Head sensitivity" value={t.faceSensitivity} min={1} max={6} step={0.1}
          onChange={(v) => setTweak('faceSensitivity', v)}></TweakSlider>
        <TweakToggle label="Mirror (left/right)" value={t.faceInvertX}
          onChange={(v) => setTweak('faceInvertX', v)}></TweakToggle>
        <TweakToggle label="Invert vertical" value={t.faceInvertY}
          onChange={(v) => setTweak('faceInvertY', v)}></TweakToggle>
        <TweakButton label="Calibrate (look straight)" onClick={face.calibrate}></TweakButton>
        <TweakToggle label="Mouth from face (jaw)" value={t.mouthFromFace}
          onChange={(v) => setTweak('mouthFromFace', v)}></TweakToggle>
        <TweakSlider label="Jaw threshold (half)" value={t.jawHalf} min={0.05} max={0.6} step={0.01}
          onChange={(v) => setTweak('jawHalf', v)}></TweakSlider>
        <TweakSlider label="Jaw threshold (full)" value={t.jawFull} min={0.1} max={0.9} step={0.01}
          onChange={(v) => setTweak('jawFull', v)}></TweakSlider>
        <TweakToggle label="Blink from face" value={t.blinkFromFace}
          onChange={(v) => setTweak('blinkFromFace', v)}></TweakToggle>
        <TweakSection label="Camera tuning"></TweakSection>
        <TweakSlider label="Brightness" value={t.faceBrightness} min={0.5} max={2} step={0.05}
          onChange={(v) => setTweak('faceBrightness', v)}></TweakSlider>
        <TweakSlider label="Contrast" value={t.faceContrast} min={0.5} max={2} step={0.05}
          onChange={(v) => setTweak('faceContrast', v)}></TweakSlider>
        {face.cameras.length > 1 ? (
          <TweakSelect label="Camera" value={face.cameraId}
            options={face.cameras.map((c) => ({ value: c.deviceId, label: c.label }))}
            onChange={(v) => face.selectCamera(v)}></TweakSelect>
        ) : null}
        <TweakRadio label="Resolution" value={t.faceResolution}
          options={[{ value: '480', label: '480p' }, { value: '720', label: '720p' }]}
          onChange={(v) => setTweak('faceResolution', v)}></TweakRadio>
        <TweakToggle label="Show preview" value={t.facePreview}
          onChange={(v) => setTweak('facePreview', v)}></TweakToggle>
        <TweakSection label="Detection (advanced)"></TweakSection>
        <TweakSlider label="Min detection" value={t.faceMinDetection} min={0.1} max={0.9} step={0.05}
          onChange={(v) => setTweak('faceMinDetection', v)}></TweakSlider>
        <TweakSlider label="Min presence" value={t.faceMinPresence} min={0.1} max={0.9} step={0.05}
          onChange={(v) => setTweak('faceMinPresence', v)}></TweakSlider>
        <TweakSlider label="Min tracking" value={t.faceMinTracking} min={0.1} max={0.9} step={0.05}
          onChange={(v) => setTweak('faceMinTracking', v)}></TweakSlider>
      </TweaksPanel>
      </>)}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App></App>);
