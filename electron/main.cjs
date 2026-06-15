// Electron メインプロセス — トマリのデスクトップ版ウィンドウ。
const { app, BrowserWindow, Menu, ipcMain, session, protocol, net, shell } = require('electron');
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

function createWindow() {
  const bounds = settings.getWindowBounds();
  win = new BrowserWindow({
    width: 900,
    height: 900,
    ...(bounds || {}),
    backgroundColor: '#FFF8EE',
    title: 'Tomari',
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
  win.on('closed', () => { win = null; });
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

// キャラクター一覧・フォルダを開く IPC
ipcMain.handle('characters:list', () => characters.listCharacters());
ipcMain.on('characters:reveal', () => { shell.openPath(characters.charactersDir()); });

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
