// Electron メインプロセス — トマリのデスクトップ版ウィンドウ。
const { app, BrowserWindow, Menu, ipcMain, session, protocol, net, shell, clipboard, screen } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const settings = require('./settings.cjs');
const characters = require('./characters.cjs');

const DEV_URL = 'http://127.0.0.1:5173/talk.html';

// キャラ画像配信用のカスタムスキーム（app ready 前に特権登録が必要）
protocol.registerSchemesAsPrivileged([
  { scheme: 'tomari-char', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let win = null;
let cursorTimer = null;

function stopCursorTracking() {
  if (cursorTimer) { clearInterval(cursorTimer); cursorTimer = null; }
}

function createWindow() {
  const bounds = settings.getWindowBounds();
  win = new BrowserWindow({
    width: 900,
    height: 900,
    ...(bounds || {}),
    backgroundColor: '#FFF8EE',
    title: 'CaffeLook',
    icon: path.join(__dirname, '..', 'CaffeLook.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, '..', 'dist', 'talk.html'));
  } else {
    win.loadURL(DEV_URL);
  }

  // 終了時にウィンドウ位置・サイズを保存
  win.on('close', () => {
    if (win && !win.isDestroyed()) settings.saveWindowBounds(win.getBounds());
  });
  win.on('closed', () => { stopCursorTracking(); win = null; });
}

function buildMenu() {
  const isDev = !app.isPackaged;
  const template = [
    {
      label: 'View',
      submenu: [
        {
          label: 'Always on top',
          type: 'checkbox',
          checked: false,
          click: (item) => { if (win) win.setAlwaysOnTop(item.checked); },
        },
        {
          // アクセラレータは付けない（レンダラ側の F9 keydown と二重発火させないため）
          label: 'Show/Hide UI (F9)',
          click: () => { if (win) win.webContents.send('toggle-ui'); },
        },
        ...(isDev
          ? [
              { type: 'separator' },
              { role: 'reload' },
              { role: 'toggleDevTools' },
            ]
          : []),
        { type: 'separator' },
        { role: 'quit', label: 'Quit' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// tweak 永続化の IPC
ipcMain.on('tweaks:load', (e, key) => { e.returnValue = settings.getTweaks(key); });
ipcMain.on('tweaks:save', (e, { key, edits }) => { settings.saveTweaks(key, edits); });

// キャラクター一覧・作成・フォルダを開く IPC
ipcMain.handle('characters:list', () => characters.listCharacters());
ipcMain.handle('characters:create', (e, { name, files }) => characters.createCharacter(name, files));
ipcMain.on('characters:reveal', () => { shell.openPath(characters.charactersDir()); });

// クリップボード書き込み（sandbox の preload では clipboard を使えないため main で実行）
ipcMain.on('clipboard:write', (e, text) => { clipboard.writeText(String(text)); });

// UI 非表示中はウィンドウ上部のメニューバー(View)も隠す。再表示で戻す。
// （Windows では Alt で一時的に呼び出せるので閉じ込めにはならない）
ipcMain.on('ui:hidden', (e, hidden) => {
  if (win) win.setMenuBarVisibility(!hidden);
});

// グローバルカーソル追従: OS のカーソル位置を一定間隔でポーリングし、
// ウィンドウのコンテンツ領域基準の相対座標（clientX/clientY 相当）にして送る。
// getCursorScreenPoint も getContentBounds も DIP 単位なので変換不要。
ipcMain.on('cursor:track', (e, on) => {
  if (on) {
    if (cursorTimer) return;
    cursorTimer = setInterval(() => {
      if (!win || win.isDestroyed()) { stopCursorTracking(); return; }
      const b = win.getContentBounds();
      const p = screen.getCursorScreenPoint();
      win.webContents.send('global-cursor', { x: p.x - b.x, y: p.y - b.y });
    }, 16);
  } else {
    stopCursorTracking();
  }
});

app.whenReady().then(() => {
  // マイク等のメディア権限を許可（口パク用 getUserMedia）
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(permission === 'media');
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media');

  // tomari-char:// → characters/ 内の実ファイルを配信
  protocol.handle('tomari-char', (request) => {
    const file = characters.resolveCharFile(request.url);
    if (!file) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  characters.ensureDefaultCharacter();

  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
