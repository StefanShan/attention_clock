const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

const WIDGET_SIZE = 50;
const PANEL_W = 192;
const PANEL_H_MAIN = 258;
const PANEL_H_DONE = 156;
const MIN_MIN = 20;
const MAX_MIN = 60;
const STEP = 10;

let widgetWin = null;
let panelWin = null;
let tray = null;
let ticker = null;
let dragTimer = null;
let dragInfo = null;

const state = {
  phase: 'idle', // idle | running | paused | done
  durationMin: 30,
  remainingMs: 30 * 60000,
  endAt: 0,
};

function broadcast() {
  const total = state.durationMin * 60000;
  const payload = {
    phase: state.phase,
    durationMin: state.durationMin,
    remainingMs: state.remainingMs,
    progress: total > 0 ? state.remainingMs / total : 0,
  };
  if (widgetWin && !widgetWin.isDestroyed()) widgetWin.webContents.send('state', payload);
  if (panelWin && !panelWin.isDestroyed()) panelWin.webContents.send('state', payload);
}

function stopTicker() {
  if (ticker) { clearInterval(ticker); ticker = null; }
}

function startTicker() {
  stopTicker();
  ticker = setInterval(() => {
    state.remainingMs = Math.max(0, state.endAt - Date.now());
    if (state.remainingMs <= 0) finish(); else broadcast();
  }, 200);
}

function finish() {
  stopTicker();
  state.remainingMs = 0;
  state.phase = 'done';
  broadcast();
  showPanel();
}

function changeDuration(delta) {
  if (state.phase !== 'idle') return;
  state.durationMin = Math.min(MAX_MIN, Math.max(MIN_MIN, state.durationMin + delta));
  state.remainingMs = state.durationMin * 60000;
  broadcast();
}

function resetTimer() {
  stopTicker();
  state.phase = 'idle';
  state.remainingMs = state.durationMin * 60000;
  broadcast();
}

function panelSizeFor(phase) {
  return phase === 'done' ? [PANEL_W, PANEL_H_DONE] : [PANEL_W, PANEL_H_MAIN];
}

function positionPanel() {
  if (!panelWin || panelWin.isDestroyed()) return;
  const [ww, wh] = widgetWin.getSize();
  const [wx, wy] = widgetWin.getPosition();
  const [pw, ph] = panelWin.getSize();
  const disp = screen.getDisplayNearestPoint({ x: wx + ww / 2, y: wy + wh / 2 });
  const wa = disp.workArea;
  let x = wx - pw - 8;
  if (x < wa.x + 5) x = wx + ww + 8;
  x = Math.min(Math.max(x, wa.x + 5), wa.x + wa.width - pw - 5);
  let y = wy + (wh - ph) / 2;
  y = Math.min(Math.max(y, wa.y + 5), wa.y + wa.height - ph - 5);
  panelWin.setPosition(Math.round(x), Math.round(y));
}

function showPanel() {
  if (!panelWin) return;
  const size = panelSizeFor(state.phase);
  if (panelWin.getSize().join(',') !== size.join(',')) panelWin.setSize(size[0], size[1]);
  positionPanel();
  panelWin.show();
  panelWin.webContents.send('panel-shown');
}

function hidePanel() {
  if (panelWin && panelWin.isVisible()) panelWin.hide();
  // 完成提醒被关闭后，回到待设置状态（下次点击悬浮窗显示第 2 部分界面）
  if (state.phase === 'done') {
    state.phase = 'idle';
    state.remainingMs = state.durationMin * 60000;
    broadcast();
  }
}

function togglePanel() {
  if (panelWin.isVisible()) { hidePanel(); return; }
  showPanel();
}

// ---------- 悬浮窗拖拽 + 点击判定 ----------
function stopDrag() {
  if (dragTimer) { clearInterval(dragTimer); dragTimer = null; }
  dragInfo = null;
}

function startDrag() {
  if (dragTimer) return;
  dragTimer = setInterval(() => {
    if (!dragInfo) { stopDrag(); return; }
    const p = screen.getCursorScreenPoint();
    const dist = Math.abs(p.x - dragInfo.px) + Math.abs(p.y - dragInfo.py);
    if (dist > 6) dragInfo.moved = true;
    if (dragInfo.moved) {
      const nx = Math.round(dragInfo.wx + p.x - dragInfo.px);
      const ny = Math.round(dragInfo.wy + p.y - dragInfo.py);
      widgetWin.setPosition(nx, ny);
      if (panelWin.isVisible()) positionPanel();
    }
  }, 16);
}

ipcMain.on('widget-mouse', (_e, type) => {
  if (type === 'down') {
    const p = screen.getCursorScreenPoint();
    const [wx, wy] = widgetWin.getPosition();
    dragInfo = { px: p.x, py: p.y, wx, wy, moved: false };
    startDrag();
  } else if (type === 'up' && dragInfo) {
    const moved = dragInfo.moved;
    const p = screen.getCursorScreenPoint();
    const dist = Math.abs(p.x - dragInfo.px) + Math.abs(p.y - dragInfo.py);
    stopDrag();
    if (!moved && dist <= 6) togglePanel();
  }
});

// ---------- 面板操作 ----------
ipcMain.on('panel-action', (_e, action) => {
  switch (action) {
    case 'inc': changeDuration(STEP); break;
    case 'dec': changeDuration(-STEP); break;
    case 'start':
    case 'resume':
      state.phase = 'running';
      state.endAt = Date.now() + state.remainingMs;
      startTicker();
      broadcast();
      break;
    case 'pause':
      state.remainingMs = Math.max(0, state.endAt - Date.now());
      state.phase = 'paused';
      stopTicker();
      broadcast();
      break;
    case 'reset':
      resetTimer();
      break;
    case 'close-reminder':
      hidePanel();
      break;
    case 'quit':
      app.quit();
      break;
  }
});

ipcMain.on('panel-hide', () => hidePanel());

// ---------- 窗口创建 ----------
function createWidget() {
  const wa = screen.getPrimaryDisplay().workArea;
  widgetWin = new BrowserWindow({
    width: WIDGET_SIZE,
    height: WIDGET_SIZE,
    x: wa.x + wa.width - WIDGET_SIZE - 17,
    y: wa.y + wa.height - WIDGET_SIZE - 78,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false, // 拖拽由主进程手动控制
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  widgetWin.setAlwaysOnTop(true, 'screen-saver');
  widgetWin.loadFile(path.join(__dirname, 'src', 'widget.html'));
}

function createPanel() {
  panelWin = new BrowserWindow({
    width: PANEL_W,
    height: PANEL_H_MAIN,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  panelWin.setAlwaysOnTop(true, 'screen-saver');
  panelWin.loadFile(path.join(__dirname, 'src', 'panel.html'));
}

function createTray() {
  let icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  if (icon.isEmpty()) icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('专注时钟');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '退出', click: () => app.quit() },
  ]));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (widgetWin && !widgetWin.isDestroyed()) widgetWin.show();
  });

  app.whenReady().then(() => {
    createWidget();
    createPanel();
    createTray();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
