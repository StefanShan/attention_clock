# 专注时钟

一个 Windows 桌面专注力时钟（番茄钟）应用。无主界面，仅一个圆形悬浮窗常驻屏幕角落，配合侧边面板完成专注设置、计时与提醒。

![tech](https://img.shields.io/badge/Electron-45-blue) ![platform](https://img.shields.io/badge/platform-Windows%20x64-brightgreen)

## 功能

- **专注时长自定义**：20 ~ 60 分钟，每次 ±10 分钟调节（边界按钮自动禁用）
- **圆形悬浮窗**：始终置顶、可拖拽、不占任务栏；空闲显示分钟数，专注时显示倒计时
- **进度环**：开始专注后，悬浮窗外圈进度环随剩余时间消耗，颜色随状态变化
- **侧边面板**：点击悬浮窗弹出，自动贴边防出界，拖拽悬浮窗时自动跟随
- **状态化配色**：空闲=紫、专注中=青绿（呼吸动画）、已暂停=橙、完成=翠绿
- **按钮状态机**：未开始只显示"开始"；开始后只显示"暂停/重置"；暂停后变"继续/重置"
- **完成提醒**：计时结束自动弹出 🎉 提醒卡片，点击悬浮窗或"好的"关闭后回到设置界面
- **托盘图标**：右键可退出；面板左上角 × 按钮也可退出
- **贴边停靠**：拖到屏幕边缘自动变成条形进度条（左右缘为竖条、上下缘为横条）；鼠标悬停时展开回圆形，移开再次收回；从边缘拖离即恢复圆形
- **单实例保护**：重复启动自动聚焦已有实例

## 技术实现

- **Electron 45**（纯 HTML/CSS/JS，无第三方运行时依赖）
- **双窗口架构**：面板（192×258）独立于悬浮窗；悬浮窗为三个预创建的透明、无边框、置顶、跳过任务栏的 `BrowserWindow`（圆形 50×50 / 竖条 30×140 / 横条 140×30），贴边变形通过显示/隐藏切换实现——Electron 透明窗口在 Windows 上放大后无法再缩小，不能动态 resize
- **主进程计时**：计时基于 `Date.now()` 时间戳 + 200ms tick，不受渲染进程休眠影响，暂停/恢复精确
- **拖拽与点击判定**：不使用系统拖拽区（会吞掉点击事件），改为渲染进程上报 `mousedown/mouseup`，主进程轮询 `screen.getCursorScreenPoint()` 移动窗口；位移 ≤6px 判定为点击
- **进度环**：SVG `stroke-dasharray/dashoffset`，四个状态各配一组渐变
- **等比缩放**：悬浮窗内容按 140px 设计，通过 CSS `zoom`（50/140 ≈ 0.357）整体缩放到目标尺寸
- **打包**：electron-builder，产出 NSIS 安装包与便携版

## 开发运行

```powershell
npm install
npm start
```

## 打包

```powershell
npm run dist
```

国内网络建议先设置镜像再执行：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm run dist
```

产物输出到 `release\`：

| 文件 | 说明 |
|---|---|
| `专注时钟 Setup 1.0.0.exe` | 安装版：双击安装，自动创建桌面/开始菜单快捷方式，带卸载器 |
| `专注时钟 1.0.0.exe` | 便携版：单文件直接运行，不写注册表、不建快捷方式 |

目标机器无需安装 Node.js 或其他依赖（64 位 Windows 即可）。

> 重新打包前先退出正在运行的应用实例。

## 项目结构

```
attention_clock/
├── main.js              # 主进程：窗口管理、计时器、拖拽/点击判定、托盘、IPC
├── preload.js           # contextBridge 暴露最小 IPC 接口
├── src/
│   ├── widget.html/css/js   # 悬浮窗：圆形表盘 + SVG 进度环
│   └── panel.html/css/js    # 面板：时间选择 / 计时控制 / 完成提醒三视图
├── scripts/gen-icon.js  # 纯 Node 生成 PNG/ICO 图标（无图像库依赖）
├── assets/              # tray.png(32) icon.png/ico(256)
└── release/             # 打包输出
```
