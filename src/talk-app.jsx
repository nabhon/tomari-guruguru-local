import React from 'react';
import ReactDOM from 'react-dom/client';
import charConfig from './character-config';
import { BG_OPTIONS, clamp, themeColors } from './engine/shared';
import { useAvatarLoop } from './engine/useAvatarLoop';
import { useMouseDirection } from './drivers/mouseDirection';
import { useAudioMouth } from './drivers/audioMouth';
import { useBlinkTimer } from './drivers/blinkTimer';
import { useFaceTracking } from './drivers/faceTracking';
import { GEN_PROMPT, GUIDE_STEPS, GUIDE_NOTE } from './character-guide';

const { useState, useRef, useMemo, useEffect, useCallback } = React;

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
  "faceDeadzoneX": 0.08,
  "faceDeadzoneY": 0.08,
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
  "faceMinTracking": 0.5,
  "character": "__builtin"
}/*EDITMODE-END*/;

// クロマキー用の単色プリセット（緑 / 青 / マゼンタ）
const CHROMA_OPTIONS = ['#00B140', '#0047BB', '#FF00FF'];

// 同梱の既定キャラ（静的ホストではこれのみ）。base は character-config の basePath。
const BUILTIN_CHAR = { id: '__builtin', name: 'Tomari', base: charConfig.basePath };

// キャラ一覧を三系統で解決: Electron(ブリッジ) / dev(フェッチ) / 静的(同梱のみ)。
// 返す base: Electron='tomari-char://chars/<name>', dev='/characters/<name>', 静的=同梱。
async function resolveCharacters() {
  const d = typeof window !== 'undefined' ? window.tomariDesktop : null;
  try {
    if (d && d.listCharacters) {
      const names = await d.listCharacters();
      const list = names.map((n) => ({ id: n, name: n, base: `tomari-char://chars/${encodeURIComponent(n)}` }));
      return list.length ? list : [BUILTIN_CHAR];
    }
    if (import.meta.env.DEV) {
      const names = await (await fetch('/__characters')).json();
      const list = names.map((n) => ({ id: n, name: n, base: `/characters/${encodeURIComponent(n)}` }));
      return list.length ? list : [BUILTIN_CHAR];
    }
  } catch { /* 失敗時は同梱へフォールバック */ }
  return [BUILTIN_CHAR];
}

// 追加用シート（A–F）とラベル
const SHEET_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];
const SHEET_DESC = {
  A: 'Eyes open · mouth closed', B: 'Eyes open · mouth half', C: 'Eyes open · mouth open',
  D: 'Eyes closed · mouth closed', E: 'Eyes closed · mouth half', F: 'Eyes closed · mouth open',
};

// 6シートを 5×5 単純分割で 150 フレーム(webp)へ。fileMap[sheet] は File。
async function sliceSheets(fileMap, onProgress) {
  const out = [];
  let done = 0;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  for (const sheet of SHEET_KEYS) {
    const bmp = await createImageBitmap(fileMap[sheet]);
    const cw = Math.floor(bmp.width / 5), ch = Math.floor(bmp.height / 5);
    canvas.width = cw; canvas.height = ch;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(bmp, c * cw, r * ch, cw, ch, 0, 0, cw, ch);
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', 1));
      out.push({ path: `${sheet}/r${r}c${c}.webp`, data: await blob.arrayBuffer() });
      if (onProgress) onProgress(++done);
    }
    if (bmp.close) bmp.close();
  }
  return out;
}

function abToB64(buf) {
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// Electron はブリッジ、dev は POST で書き出す。→ {ok, error?}
async function writeCharacter(name, frames) {
  const d = typeof window !== 'undefined' ? window.tomariDesktop : null;
  if (d && d.createCharacter) return await d.createCharacter(name, frames);
  const files = frames.map((f) => ({ path: f.path, b64: abToB64(f.data) }));
  const res = await fetch('/__characters/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, files }),
  });
  return await res.json();
}

const CAN_ADD = (typeof window !== 'undefined' && window.tomariDesktop && window.tomariDesktop.createCharacter)
  || import.meta.env.DEV;

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

function App() {
  const [t, setTweak] = useTweaks(TALK_DEFAULTS);
  const [cell, setCell] = useState({ r: 2, c: 2 });
  const [mouth, setMouth] = useState(0);        // 0:とじ 1:中間 2:開け
  // UI を隠してキャラだけ表示（キャプチャ用）。永続化しない＝起動時は常に表示。
  const [hideUI, setHideUI] = useState(false);

  // キャラクター: 一覧（既定は同梱のみ）と現在のベースURL。
  const [characters, setCharacters] = useState([BUILTIN_CHAR]);
  const [charBase, setCharBase] = useState(BUILTIN_CHAR.base);
  const [charMenuOpen, setCharMenuOpen] = useState(false);
  // 追加/ガイドのモーダル状態
  const [showAdd, setShowAdd] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [addName, setAddName] = useState('');
  const [addFiles, setAddFiles] = useState({});   // { A: File, ... }
  const [addStatus, setAddStatus] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const charRef = useRef(null);
  const meterRef = useRef(null);
  const target = useRef({ x: 0, y: 0 });
  const tweaksRef = useRef(t);
  tweaksRef.current = t;

  // キャラ一覧を再取得。永続化された選択を復元し、無ければ先頭にフォールバック。
  const refreshCharacters = useCallback(async () => {
    const list = await resolveCharacters();
    setCharacters(list);
    const want = list.find((c) => c.id === tweaksRef.current.character) || list[0];
    setCharBase(want.base);
    if (want.id !== tweaksRef.current.character) setTweak('character', want.id);
    return list;
  }, [setTweak]);
  useEffect(() => { refreshCharacters(); }, [refreshCharacters]);

  const selectCharacter = useCallback((c) => {
    setCharBase(c.base);
    setTweak('character', c.id);
  }, [setTweak]);

  // 追加フロー: 検証 → スライス → 書き出し → 一覧更新 → 新キャラ選択
  const doCreate = useCallback(async () => {
    const name = addName.trim();
    if (!name) { setAddStatus('Enter a name'); return; }
    if (/[\\/:*?"<>|]/.test(name) || name === '.' || name === '..') { setAddStatus('Name has invalid characters'); return; }
    if (SHEET_KEYS.some((k) => !addFiles[k])) { setAddStatus('Pick all 6 sheets (A–F)'); return; }
    setAddBusy(true);
    try {
      setAddStatus('Slicing 0/150');
      const frames = await sliceSheets(addFiles, (n) => setAddStatus(`Slicing ${n}/150`));
      setAddStatus('Saving…');
      const res = await writeCharacter(name, frames);
      if (!res || !res.ok) {
        setAddStatus(res && res.error === 'exists' ? 'A character with that name already exists' : 'Could not save (check the name)');
        setAddBusy(false);
        return;
      }
      const list = await refreshCharacters();
      const made = list.find((c) => c.id === name);
      if (made) selectCharacter(made);
      setShowAdd(false); setAddName(''); setAddFiles({}); setAddStatus('');
    } catch (e) {
      setAddStatus('Error: ' + (e && e.message ? e.message : String(e)));
    }
    setAddBusy(false);
  }, [addName, addFiles, refreshCharacters, selectCharacter]);

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
      <div ref={charRef} style={{
        position: 'relative',
        width: `${sizeVmin}vmin`, height: `${sizeVmin}vmin`,
        maxWidth: 1200, maxHeight: 1200,
        userSelect: 'none', touchAction: 'none'
      }}>
        {allFrames.map(({ s, r, c }) => (
          <img key={`${s}${r}${c}`} src={charConfig.srcFrom(charBase, s, r, c)} alt="" draggable="false" style={{
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
      {/* 左サイドの開閉式キャラメニュー（チップ＝開閉ハンドル）。F9 で他チャ同様に隠れる。 */}
      <button onClick={() => setCharMenuOpen((v) => !v)} style={{
        position: 'absolute', left: charMenuOpen ? 220 : 0, top: '50%', transform: 'translateY(-50%)',
        transition: 'left 0.25s ease', zIndex: 5,
        background: panelBg, color: inkColor, border: `1px solid ${lineColor}`, borderLeft: 'none',
        borderRadius: '0 12px 12px 0', padding: '16px 7px', cursor: 'pointer',
        fontFamily: 'inherit', fontWeight: 700, fontSize: 12, letterSpacing: '0.15em',
        writingMode: 'vertical-rl', backdropFilter: 'blur(10px)'
      }}>Chars</button>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 220, zIndex: 4,
        transform: charMenuOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.25s ease',
        background: panelBg, borderRight: `1px solid ${lineColor}`, backdropFilter: 'blur(12px)',
        display: 'flex', flexDirection: 'column', gap: 8, padding: 16, boxSizing: 'border-box',
        boxShadow: '4px 0 24px rgba(60,48,38,0.10)'
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: inkColor, letterSpacing: '0.08em' }}>Characters</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', flex: 1 }}>
          {characters.map((c) => {
            const on = charBase === c.base;
            return (
              <button key={c.id} onClick={() => selectCharacter(c)} style={{
                textAlign: 'left', fontFamily: 'inherit', fontWeight: 700, fontSize: 13,
                color: on ? '#fff' : inkColor, background: on ? '#D96C4F' : 'transparent',
                border: `1.5px solid ${on ? '#D96C4F' : lineColor}`, borderRadius: 10,
                padding: '9px 12px', cursor: 'pointer'
              }}>{c.name}</button>
            );
          })}
        </div>
        {CAN_ADD ? (
          <button onClick={() => { setAddStatus(''); setShowAdd(true); }} style={{
            fontFamily: 'inherit', fontWeight: 700, fontSize: 12, color: '#fff',
            background: '#D96C4F', border: '1.5px solid #D96C4F', borderRadius: 10,
            padding: '8px 12px', cursor: 'pointer'
          }}>＋ Add character</button>
        ) : null}
        <button onClick={() => setShowGuide(true)} style={{
          fontFamily: 'inherit', fontWeight: 700, fontSize: 12, color: inkColor,
          background: 'transparent', border: `1.5px solid ${lineColor}`, borderRadius: 10,
          padding: '8px 12px', cursor: 'pointer'
        }}>？ How to make</button>
        <button onClick={refreshCharacters} style={{
          fontFamily: 'inherit', fontWeight: 700, fontSize: 12, color: inkColor,
          background: 'transparent', border: `1.5px solid ${lineColor}`, borderRadius: 10,
          padding: '8px 12px', cursor: 'pointer'
        }}>↻ Refresh list</button>
        {(typeof window !== 'undefined' && window.tomariDesktop && window.tomariDesktop.revealCharacters) ? (
          <button onClick={() => window.tomariDesktop.revealCharacters()} style={{
            fontFamily: 'inherit', fontWeight: 700, fontSize: 12, color: subColor,
            background: 'transparent', border: `1.5px solid ${lineColor}`, borderRadius: 10,
            padding: '8px 12px', cursor: 'pointer'
          }}>📁 Open folder</button>
        ) : null}
      </div>

      {/* キャラ追加モーダル */}
      {showAdd ? (
        <div onClick={() => { if (!addBusy) setShowAdd(false); }} style={{
          position: 'absolute', inset: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)'
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: 'min(440px, 92vw)', maxHeight: '88vh', overflowY: 'auto',
            background: panelBg, border: `1px solid ${lineColor}`, borderRadius: 16, padding: 20,
            display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: inkColor }}>Add character</div>
            <div style={{ fontSize: 12, color: subColor }}>Pick the 6 angle sheets (5×5 each). They’re sliced into 150 frames automatically.</div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: inkColor }}>
              Name
              <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="MyCharacter" style={{
                fontFamily: 'inherit', fontSize: 14, padding: '8px 10px', borderRadius: 8,
                border: `1.5px solid ${lineColor}`, background: 'rgba(255,255,255,0.6)', color: inkColor
              }}></input>
            </label>
            {SHEET_KEYS.map((k) => (
              <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: inkColor }}>
                <span style={{ fontWeight: 700 }}>{k} — {SHEET_DESC[k]} {addFiles[k] ? '✓' : ''}</span>
                <input type="file" accept="image/*" onChange={(e) => {
                  const f = e.target.files && e.target.files[0];
                  setAddFiles((prev) => ({ ...prev, [k]: f || undefined }));
                }} style={{ fontSize: 12, color: subColor }}></input>
              </label>
            ))}
            {addStatus ? <div style={{ fontSize: 12, fontWeight: 700, color: subColor }}>{addStatus}</div> : null}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button disabled={addBusy} onClick={() => setShowAdd(false)} style={{
                fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: inkColor,
                background: 'transparent', border: `1.5px solid ${lineColor}`, borderRadius: 10, padding: '8px 16px', cursor: 'pointer'
              }}>Cancel</button>
              <button disabled={addBusy} onClick={doCreate} style={{
                fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: '#fff',
                background: addBusy ? '#aaa' : '#D96C4F', border: 'none', borderRadius: 10, padding: '8px 16px',
                cursor: addBusy ? 'default' : 'pointer'
              }}>{addBusy ? 'Working…' : 'Create'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 生成ガイドモーダル */}
      {showGuide ? (
        <div onClick={() => setShowGuide(false)} style={{
          position: 'absolute', inset: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)'
        }}>
          <div className="no-bar" onClick={(e) => e.stopPropagation()} style={{
            width: 'min(560px, 94vw)', maxHeight: '90vh', overflowY: 'auto',
            background: panelBg, border: `1px solid ${lineColor}`, borderRadius: 16, padding: 20,
            display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: inkColor }}>How to make a character</div>
            <img src="guide/template-grid.png" alt="5×5 angle template (grid)" style={{
              maxWidth: '100%', maxHeight: '38vh', objectFit: 'contain', alignSelf: 'center',
              borderRadius: 10, border: `1px solid ${lineColor}`, background: '#fff'
            }}></img>
            <a href="guide/template-grid.png" download="tomari-5x5-template.png" style={{
              alignSelf: 'center', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, color: inkColor,
              textDecoration: 'none', border: `1.5px solid ${lineColor}`, borderRadius: 10, padding: '7px 14px'
            }}>⤓ Download template (attach this to ChatGPT)</a>
            <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: inkColor }}>
              {GUIDE_STEPS.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
            <div style={{ fontSize: 11, color: subColor }}>{GUIDE_NOTE}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
              <button onClick={async () => {
                let ok = false;
                // Electron(file://)では navigator.clipboard が使えないのでネイティブ経由。
                if (window.tomariDesktop?.copyText) {
                  try { window.tomariDesktop.copyText(GEN_PROMPT); ok = true; } catch {}
                } else {
                  try { await navigator.clipboard.writeText(GEN_PROMPT); ok = true; } catch {}
                }
                if (ok) {
                  setPromptCopied(true);
                  setTimeout(() => setPromptCopied(false), 1500);
                }
              }} style={{
                fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: '#fff',
                background: '#4F86D9', border: 'none', borderRadius: 10, padding: '8px 16px', cursor: 'pointer'
              }}>{promptCopied ? 'Copied!' : 'Copy prompt'}</button>
              <button onClick={() => setShowGuide(false)} style={{
                fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: inkColor,
                background: 'transparent', border: `1.5px solid ${lineColor}`, borderRadius: 10, padding: '8px 16px', cursor: 'pointer'
              }}>Close</button>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ position: 'absolute', top: '3.5vh', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ fontSize: 'clamp(18px, 2.4vmin, 26px)', fontWeight: 700, color: inkColor, letterSpacing: '0.18em' }}>Charac Talk</div>
        <div style={{ fontSize: 'clamp(12px, 1.6vmin, 16px)', color: subColor, marginTop: 4, letterSpacing: '0.08em' }}>-</div>
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
          {audio.micOn ? 'Stop mic' : 'Start mic'}
        </button>

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
          {face.cameraOn ? 'Stop face cam' : 'Start face cam'}
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 150 }}>
          <div style={{ fontSize: 11, color: subColor, letterSpacing: '0.06em', display: 'flex', justifyContent: 'space-between' }}>
            <span>Volume</span>
            <span>{['Closed', 'Half', 'Open'][mouth]}</span>
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
        <div style={{ position: 'absolute', bottom: 92, left: '50%', transform: 'translateX(-50%)', color: subColor, fontSize: 12 }}>Face tracking runs only on this device (nothing is sent)</div>
      ) : null}

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
        <TweakSlider label="Deadzone (horizontal)" value={t.faceDeadzoneX} min={0} max={0.5} step={0.01}
          onChange={(v) => setTweak('faceDeadzoneX', v)}></TweakSlider>
        <TweakSlider label="Deadzone (vertical)" value={t.faceDeadzoneY} min={0} max={0.5} step={0.01}
          onChange={(v) => setTweak('faceDeadzoneY', v)}></TweakSlider>
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
