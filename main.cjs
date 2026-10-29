const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  powerSaveBlocker,
  nativeTheme,
} = require('electron');
const path = require('node:path');

app.setName('拍间 Tempo');
if (process.env.TEMPO_TEST_PROFILE)
  app.setPath('userData', process.env.TEMPO_TEST_PROFILE);
let win;
let blocker;
const isMac = process.platform === 'darwin';

function preventSuspension(playing) {
  if (playing && blocker === undefined)
    blocker = powerSaveBlocker.start('prevent-app-suspension');
  if (!playing && blocker !== undefined) {
    if (powerSaveBlocker.isStarted(blocker)) powerSaveBlocker.stop(blocker);
    blocker = undefined;
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1080,
    height: 820,
    minWidth: 680,
    minHeight: 660,
    title: '拍间 Tempo',
    backgroundColor: '#ebeff2',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 20, y: 17 } : undefined,
    show: false,
    autoHideMenuBar: !isMac,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('render-process-gone', () => preventSuspension(false));
  win.on('closed', () => {
    preventSuspension(false);
    win = undefined;
  });
}

ipcMain.handle('tempo:pin', (event, pinned) => {
  if (event.sender !== win?.webContents) return false;
  win.setAlwaysOnTop(Boolean(pinned));
  return win.isAlwaysOnTop();
});
ipcMain.on('tempo:playing', (event, playing) => {
  if (event.sender === win?.webContents) preventSuspension(Boolean(playing));
});
ipcMain.on('tempo:theme', (event, dark) => {
  if (event.sender === win?.webContents) {
    nativeTheme.themeSource = dark ? 'dark' : 'light';
    win.setBackgroundColor(dark ? '#202d36' : '#ebeff2');
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac
        ? [
            {
              label: app.name,
              submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' },
              ],
            },
          ]
        : []),
      {
        label: '编辑',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: '控制',
        submenu: [
          {
            label: '开始 / 暂停',
            accelerator: 'CmdOrCtrl+Return',
            click: () => win?.webContents.send('tempo:action', 'play'),
          },
          {
            label: '专注模式',
            accelerator: 'CmdOrCtrl+Shift+F',
            click: () => win?.webContents.send('tempo:action', 'focus'),
          },
          {
            label: '键盘快捷键',
            click: () => win?.webContents.send('tempo:action', 'help'),
          },
        ],
      },
      {
        label: '窗口',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          ...(isMac ? [{ role: 'front' }] : [{ role: 'close' }]),
        ],
      },
    ]),
  );
  createWindow();
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});
app.on('window-all-closed', () => {
  preventSuspension(false);
  if (!isMac) app.quit();
});
app.on('before-quit', () => preventSuspension(false));
