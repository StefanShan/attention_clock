const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

const WIDGET_SIZE = 50;      // 圆形窗口
const BAR_LEN = 140;         // 条形长度
const BAR_THICK = 15;        // 可见条形厚度
const EDGE = 2;
const PANEL_W = 192;
const PANEL_H_MAIN = 258;
const PANEL_H_DONE = 156;
const MIN_MIN = 20;
const MAX_MIN = 60;
const STEP = 10;

let circleWin = null;
let vbarWin = null;
let hbarWin = null;
let panelWin = null;
let tray = null;
let ticker = null;
let dragTimer = null;
let dragInfo = null;
// 贴边停靠状态：null = 圆形自由模式
let dock = null; // { side: 'left'|'right'|'top'|'bottom', center: {x,y} }
let hovered = false;
let ignoreHoverPt = null;
let lastDragEnd = 0;

const state = {
  phase: 'idle', // idle | running | paused | done
  durationMin: 30,
  remainingMs: 30 * 60000,
  endAt: 0,
};

function alive(w) { return w && !w.isDestroyed(); }

function widgetWindows() { return [circleWin, vbarWin, hbarWin]; }

// 当前承载悬浮窗的窗口：停靠为条形时是对应的条形窗口，否则是圆形
function activeWidget() {
  if (dock && !hovered) {
    return (dock.side === 'left' || dock.side === 'right') ? vbarWin : hbarWin;
  }
  return circleWin;
}

function broadcast() {
  const total = state.durationMin * 60000;
  const payload = {
    phase: state.phase,
    durationMin: state.durationMin,
    remainingMs: state.remainingMs,
    progress: total > 0 ? state.remainingMs / total : 0,
    mode: dock && !hovered ? 'bar' : 'circle',
    side: dock ? dock.side : null,
  };
  for (const w of widgetWindows()) {
    if (alive(w)) w.webContents.send('state', payload);
  }
  if (alive(panelWin)) panelWin.webContents.send('state', payload);
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
  if (!alive(panelWin)) return;
  const win = activeWidget();
  if (!alive(win)) return;
  const [ww, wh] = win.getSize();
  const [wx, wy] = win.getPosition();
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
  if (!alive(panelWin)) return;
  const size = panelSizeFor(state.phase);
  if (panelWin.getSize().join(',') !== size.join(',')) panelWin.setSize(size[0], size[1]);
  positionPanel();
  panelWin.show();
  panelWin.webContents.send('panel-shown');
}

function hidePanel() {
  if (alive(panelWin) && panelWin.isVisible()) panelWin.hide();
  // 完成提醒被关闭后，回到待设置状态（下次点击悬浮窗显示设置界面）
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

// ---------- 贴边停靠 ----------
// 窗口落点是否在某条屏幕边上（拖拽松手时判定）
function dockedSide(x, y, w, h, wa) {
  if (x <= wa.x + EDGE) return 'left';
  if (x + w >= wa.x + wa.width - EDGE) return 'right';
  if (y <= wa.y + EDGE) return 'top';
  if (y + h >= wa.y + wa.height - EDGE) return 'bottom';
  return null;
}

// 显示对应的条形窗口（预创建、不 resize，规避透明窗口无法缩小的问题）
function showBar() {
  if (!dock) return;
  const vertical = dock.side === 'left' || dock.side === 'right';
  const win = vertical ? vbarWin : hbarWin;
  if (!alive(win)) return;
  const wa = screen.getDisplayNearestPoint(dock.center).workArea;
  const [aw, ah] = win.getSize();
  let x, y;
  if (vertical) {
    x = dock.side === 'left' ? wa.x + EDGE : wa.x + wa.width - EDGE - aw;
    y = Math.min(Math.max(dock.center.y - ah / 2, wa.y + EDGE), wa.y + wa.height - EDGE - ah);
  } else {
    y = dock.side === 'top' ? wa.y + EDGE : wa.y + wa.height - EDGE - ah;
    x = Math.min(Math.max(dock.center.x - aw / 2, wa.x + EDGE), wa.x + wa.width - EDGE - aw);
  }
  win.setPosition(Math.round(x), Math.round(y));
  win.showInactive();
  for (const w of widgetWindows()) {
    if (alive(w) && w !== win) w.hide();
  }
  if (alive(panelWin) && panelWin.isVisible()) positionPanel();
}

function showCircle(centerX, centerY) {
  if (!alive(circleWin)) return;
  const wa = screen.getDisplayNearestPoint({ x: Math.round(centerX), y: Math.round(centerY) }).workArea;
  const x = Math.min(Math.max(centerX - WIDGET_SIZE / 2, wa.x + EDGE), wa.x + wa.width - EDGE - WIDGET_SIZE);
  const y = Math.min(Math.max(centerY - WIDGET_SIZE / 2, wa.y + EDGE), wa.y + wa.height - EDGE - WIDGET_SIZE);
  circleWin.setPosition(Math.round(x), Math.round(y));
  circleWin.showInactive();
  for (const w of widgetWindows()) {
    if (alive(w) && w !== circleWin) w.hide();
  }
  if (alive(panelWin) && panelWin.isVisible()) positionPanel();
}

function collapseToBar() {
  hovered = false;
  ignoreHoverPt = screen.getCursorScreenPoint();
  showBar();
  broadcast();
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
    const win = activeWidget();
    if (!alive(win)) { stopDrag(); return; }
    const p = screen.getCursorScreenPoint();
    const dist = Math.abs(p.x - dragInfo.px) + Math.abs(p.y - dragInfo.py);
    if (dist > 6) dragInfo.moved = true;
    if (!dragInfo.moved) return;
    const nx = Math.round(dragInfo.wx + p.x - dragInfo.px);
    const ny = Math.round(dragInfo.wy + p.y - dragInfo.py);
    // 限制在光标所在显示器的可用区域内，不可拖出屏幕
    const [ww, wh] = win.getSize();
    const disp = screen.getDisplayNearestPoint({ x: nx + Math.round(ww / 2), y: ny + Math.round(wh / 2) });
    const wa = disp.workArea;
    const cx = Math.min(Math.max(nx, wa.x + EDGE), wa.x + wa.width - EDGE - ww);
    const cy = Math.min(Math.max(ny, wa.y + EDGE), wa.y + wa.height - EDGE - wh);
    win.setPosition(cx, cy);
    if (panelWin.isVisible()) positionPanel();
  }, 16);
}

ipcMain.on('widget-mouse', (_e, type) => {
  if (type === 'down') {
    const win = activeWidget();
    if (!alive(win)) return;
    const p = screen.getCursorScreenPoint();
    const [wx, wy] = win.getPosition();
    dragInfo = { px: p.x, py: p.y, wx, wy, moved: false };
    startDrag();
  } else if (type === 'up' && dragInfo) {
    const moved = dragInfo.moved;
    const p = screen.getCursorScreenPoint();
    const dist = Math.abs(p.x - dragInfo.px) + Math.abs(p.y - dragInfo.py);
    const win = activeWidget();
    stopDrag();
    lastDragEnd = Date.now();
    if (!moved && dist <= 6) { togglePanel(); return; }
    // 拖拽过程不变形，松手时按落点决定停靠或还原圆形
    if (alive(win)) {
      const b = win.getBounds();
      const wa = screen.getDisplayNearestPoint({ x: b.x + b.width / 2, y: b.y + b.height / 2 }).workArea;
      const side = dockedSide(b.x, b.y, b.width, b.height, wa);
      if (side) {
        dock = { side, center: { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) } };
        hovered = false;
        showBar();
        broadcast();
        return;
      }
    }
    if (dock) { dock = null; hovered = false; showCircle(p.x, p.y); }
    broadcast();
  }
});

// 贴边停靠时：光标悬停展开为圆形，移开收回为条形（主进程轮询判定）
function startHoverPoll() {
  setInterval(() => {
    if (!dock || !alive(circleWin)) return;
    if (dragInfo || Date.now() - lastDragEnd < 250) return;
    const win = activeWidget();
    if (!alive(win)) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const inside = p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
    if (inside && !hovered) {
      if (ignoreHoverPt) {
        if (Math.abs(p.x - ignoreHoverPt.x) + Math.abs(p.y - ignoreHoverPt.y) < 8) return;
        ignoreHoverPt = null;
      }
      hovered = true;
      showCircle(p.x, p.y);
      broadcast();
    } else if (!inside && hovered) {
      collapseToBar();
    }
  }, 120);
}

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
function createWidgetWindow(w, h, show) {
  const win = new BrowserWindow({
    width: w,
    height: h,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false, // 拖拽由主进程手动控制
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, 'src', 'widget.html'));
  return win;
}

function createWidgets() {
  const wa = screen.getPrimaryDisplay().workArea;
  circleWin = createWidgetWindow(WIDGET_SIZE, WIDGET_SIZE, true);
  circleWin.setPosition(wa.x + wa.width - WIDGET_SIZE - 17, wa.y + wa.height - WIDGET_SIZE - 78);
  // 条形窗口预创建、尺寸固定（透明窗口放大后无法缩小，不能动态 resize）
  vbarWin = createWidgetWindow(BAR_THICK, BAR_LEN, false);
  hbarWin = createWidgetWindow(BAR_LEN, BAR_THICK, false);
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
    if (alive(circleWin)) circleWin.showInactive();
  });

  app.whenReady().then(() => {
    createWidgets();
    createPanel();
    createTray();
    startHoverPoll();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
