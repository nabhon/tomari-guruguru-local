// Electron メインプロセス — トマリのデスクトップ版ウィンドウ。
const { app, BrowserWindow, Menu, ipcMain, session } = require('electron');
const path = require('node:path');
const settings = require('./settings.cjs');

const DEV_URL = 'http://127.0.0.1:5173/talk.html';

let win = null;

function createWindow() {
  const bounds = settings.getWindowBounds();
  win = new BrowserWindow({
    width: 900,
    height: 900,
    ...(bounds || {}),
    backgroundColor: '#FFF8EE',
    title: 'トマリ',
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
      label: '表示',
      submenu: [
        {
          label: '最前面に固定',
          type: 'checkbox',
          checked: false,
          click: (item) => { if (win) win.setAlwaysOnTop(item.checked); },
        },
        ...(isDev
          ? [
              { type: 'separator' },
              { role: 'reload' },
              { role: 'toggleDevTools' },
            ]
          : []),
        { type: 'separator' },
        { role: 'quit', label: '終了' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// tweak 永続化の IPC
ipcMain.on('tweaks:load', (e, key) => { e.returnValue = settings.getTweaks(key); });
ipcMain.on('tweaks:save', (e, { key, edits }) => { settings.saveTweaks(key, edits); });

app.whenReady().then(() => {
  // マイク等のメディア権限を許可（口パク用 getUserMedia）
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(permission === 'media');
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media');

  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
