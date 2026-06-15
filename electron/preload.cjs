// レンダラに最小の永続化ブリッジを公開する。
// useTweaks（src/tweaks-panel.jsx）が window.tomariDesktop の有無で
// 保存先を切り替える。ブリッジが無ければ従来の postMessage 経路のまま。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tomariDesktop', {
  // 起動時に一度だけ同期で読む（小さなオブジェクト）
  loadTweaks: (key) => ipcRenderer.sendSync('tweaks:load', key),
  // 変更のたびに差分を送る（fire-and-forget）
  saveTweaks: (key, edits) => ipcRenderer.send('tweaks:save', { key, edits }),
  // 表示メニューからの UI 表示/非表示トグル。解除関数を返す。
  onToggleUI: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('toggle-ui', handler);
    return () => ipcRenderer.removeListener('toggle-ui', handler);
  },
  // キャラクター一覧の取得 / 作成 / characters フォルダを開く
  listCharacters: () => ipcRenderer.invoke('characters:list'),
  createCharacter: (name, files) => ipcRenderer.invoke('characters:create', { name, files }),
  revealCharacters: () => ipcRenderer.send('characters:reveal'),
});
