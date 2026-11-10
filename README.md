# QiBox 工具箱

Windows 桌面上的紧凑工具箱外壳：默认 380 × 560 的主窗口（最小 360 × 520），左侧分类、右侧分组项目列表。
界面按已确认的设计稿逐条迁移（白底 + 蓝灰 `#516fd1`、6 px 圆角、Lucide 图标本地打包），
本轮只交付可运行界面，**所有系统动作都是演示态**。

## 环境要求

- Node.js ≥ 22（开发时使用 26.x）
- pnpm ≥ 10
- Rust 1.8x + MSVC 工具链（仅桌面端）
- WebView2 Runtime（Windows 10/11 一般已内置）

## 启动

```powershell
pnpm install

# 浏览器预览（主窗口 380 宽，面板在独立浏览器窗口打开）
pnpm dev
# 打开 http://localhost:1420

# Tauri 桌面端（真实 380×560 无边框窗口）
pnpm desktop:dev
```

## 构建

```powershell
# 前端校验与产物
pnpm exec tsc --noEmit
pnpm build

# 桌面安装包（NSIS）
pnpm desktop:build
# 产物：src-tauri/target/release/bundle/nsis/QiBox_0.1.0_x64-setup.exe
```

安装包是每用户安装（不需要管理员权限），默认装到 `%LocalAppData%\QiBox`，带开始菜单与桌面快捷方式，卸载项写在 HKCU。安装包未做代码签名，SmartScreen 会提示“未知发布者”，选“更多信息 → 仍要运行”即可。

## 现在能做什么（桌面端）

- 拖动排序：项目行可上下拖动改顺序（跨分组松手会改所属分组，拖到左侧分类名上会移动到该分类）；左侧分类也可拖动排序。拖动后「排序方式」自动变成「自定义顺序」，名字保持你拖的位置；排序菜单里仍可一键切回按名称/按分组。
- 主窗口可拖动边缘缩放，最小 360 × 520，默认 380 × 560（首次启动与恢复默认）；窗口尺寸写进配置并在下次启动还原。旧版本留下的 410 × 569 旧默认会自动换成新默认，手动拖过的其他尺寸保持不动。宽度低于 400 时分类栏自动收窄到 82px。
- 窗口位置：拖动主窗口后位置写进配置（物理像素），下次启动回到原位；拔掉副屏或改分辨率导致位置落在屏幕外时自动居中，不会出现“窗口在屏幕外找不回来”。
- 启动项目：支持 `%mp%`（程序目录）、`%mr%`、`%so%`、`%so-url%`、`%name%`、`%path%`、`%category%`、`%group%` 变量；目录/文件/URL/`.lnk` 走 `cmd /c start`，`.exe` 直接创建进程，勾选“以管理员身份运行”会弹 UAC。
- 脚本按解释器启动：`.ps1` → `powershell -NoProfile -ExecutionPolicy Bypass -File`，`.bat`/`.cmd` → `cmd /C`，`.py` → `python`，`.js`/`.mjs` → `node`；编辑器里的“解释器”可以覆盖这份默认表（例如填 `wsl`）。提权时同样带着解释器一起提权，不会把 `.ps1` 交给记事本。
- 项目可设工作目录（编辑器“工作目录”，支持变量）和自定义图标（Lucide 名称，点“选择”从图标网格里挑）。
- WSL 项目：编辑器“运行环境”选 `WSL` 后，目标写成 Linux 命令（如 `nmap`），可选发行版（留空=默认）和 Linux 工作目录。发行版是下拉选择（启动时读 `wsl --list --quiet`，含“默认发行版”），实际执行 `wsl [-d 发行版] [--cd 目录] -- <命令> <参数>`，逐段传参、不经过 Windows shell；`.sh` 自动用 `bash` 启动，解释器字段在 WSL 下同样生效。WSL 内不提权，需要时在命令里写 `sudo`。
- 拼音搜索：搜索框支持全拼和首字母（如 `xxsj` / `xinxi` 命中「信息收集」），设置 → 搜索里可分别关掉「拼音」「拼音首字母」；同时支持 `正则表达式` 开关。
- 快速设置：主菜单 → 快速设置 → 快速设置面板，一页切换置顶、双击运行、开机启动、显示类型、图标尺寸、分类位置、关闭按钮行为，改完主窗口立刻同步。
- 快捷键捕获：设置里的「全局快捷键 / 搜索快捷键」以及项目编辑器的「快捷键」，点一下就直接按键（Ctrl/Alt/Shift/Win + 任意键），Esc 取消，Delete 清空，不用手打文本。
- 界面字体：设置 → 界面 → 窗口 → 界面字体，输入或从系统已安装字体里挑（下拉来自 `%WINDIR%\Fonts` 里的真实字体列表），主窗口与所有面板一起生效。
- 分类栏不显示滚动条（仍然可以滚轮滚动）。
- 托盘常驻：主窗口与面板窗口都不在任务栏显示（`skipTaskbar`），只能从托盘图标、全局热键或桌面快捷方式唤起；关闭窗口默认隐藏到托盘而不是退出。
- 深色主题：设置 → 界面 → 主题 里可选 `深色 · 蓝灰`、`深色 · 中性灰`，主窗口与所有面板一起切换（含滚动条、菜单、弹窗、按钮），背景图与自调色板仍然生效；切换即时完成，不需要重启。
- 主题文件：主题编辑器里「保存」写入 `%AppData%\QiBox\themes\<名称>.json`，「导入主题」读任意 `.json`，工具条会列出本机主题一键套用；主题文件包含主色、圆角、背景图路径和调色板。改主色/圆角即时生效，不需要重启。
- 图片图标：项目编辑器「图标」行有三个按钮——「选择」挑 Lucide 图标、「图片」选 png/jpg/webp/gif/bmp/avif/ico、「程序」选 exe/dll 自动从 PE 资源里抽主图标（多尺寸一起带出，浏览器取最大帧）。配置里只存 `file:<路径>`，可写绝对路径、相对程序目录的相对路径，或带 `%mp%` 变量（例如 `file:%mp%\Tools\Nmap\nmap.ico`）。只读解析，不执行目标程序；不选图标就按启动类型用默认 Lucide 图标。
map.ico`）。只读解析，不执行目标程序；不选图标就按启动类型用默认 Lucide 图标。
- 路径转换：项目右键「路径转换」可把目标/起始位置在「绝对路径」和 `%mp%` 相对路径之间批量转换，可选当前分类或所有项目。
- 分类口令：右键分类「设置密码」后该分类上会挂锁，点击需要输入口令才能进入；口令只在本次运行内记住，配置里存的是明文，仅用于本地防误看。
- 拖放添加：把 exe/脚本/文件夹直接拖进主窗口，弹「批量添加项目」，按扩展名自动判断 GUI/CLI/脚本/文件夹类型。
- 路径变量：`%cmacckkTools%` 展开成「工具根目录」，默认 `F:\MayeLite\cmacckkTools`，可在 设置 → 常规 → 工具根目录 里改。项目目标/起始位置/参数里都可以用它，换机器只改这一处；Maye 数据导入时 `%mayelite_path%\cmacckkTools\…` 会自动转成 `%cmacckkTools%\…`。
- 背景图片：设置 → 界面 → 「背景图片」点「选择图片」挑本地图片（png/jpg/webp/gif/bmp/avif，单张不超过 12 MB）；可选 居中缩放/等比缩放/缩放/平铺/不重复，透明度 0–100 只作用于图片本身。配置里只存路径，图片在启动时按需读取，不会把图片塞进 `config.json`；浏览器预览用文件选择器转 data URL，仅本次会话有效。
- 快捷键：F2 编辑当前项目、F4 设置、Ctrl+K 或 Ctrl+F 搜索、Alt+1–9 运行搜索结果、Shift+F10 打开项目菜单、Esc 逐层返回。
- 托盘常驻：左键显示/隐藏，菜单含 显示主窗口 / 设置 / 隐藏主窗口 / 退出 QiBox；标题栏关闭按钮按设置执行“隐藏到托盘”或“退出程序”。
- 全局热键：默认 `Alt+Space` 显示/隐藏，`Ctrl+Alt+Space` 直接进入搜索；设置里改完立即重新注册。
- 项目级热键：编辑器「快捷键」页填的组合会注册成系统全局热键，按一下就启动该项目；改完保存立即重新注册，注册失败（被别的程序占用）会在主窗口提示。
- 批量操作：Ctrl 多选后批量条多了「改分类」「改分组」「收藏」，主菜单「批量操作」里也有；改分组可以填新名字，也可以从已有分组里挑。
- 打开方式：项目右键「打开方式」可指定用哪个程序打开目标（默认 `notepad.exe`，也能选 `cmd.exe`/`powershell.exe` 或浏览任意 exe），附加参数会排在目标路径前面，可选管理员权限。
- 搜索键盘操作：搜索框里 `↑`/`↓` 移动高亮，`Enter` 直接运行高亮项；`Alt+1–9` 仍然可用。
- 单实例：重复启动只会唤起已有窗口。
- 数据：`%AppData%\QiBox\config.json`，400ms 防抖 + 临时文件原子替换；每天最多留一份备份，`%AppData%\QiBox\backups` 保留最近 10 份；支持导入、导出、从备份恢复。
- 从 Maye / Maye Nano 迁移：数据管理 → 迁移数据 → 「选择 MDB.json」（同目录有 `cfg.json` 会自动一起读）。合并会跳过同名同目标的重复项，替换会先落一份当天备份再整体导入。导入内容：分类与顺序、分组标题、项目名称/目标/参数/工作目录/备注/热键/管理员位；项目类型按目标推断（`.exe` 看是否 `cmd.exe` 等外壳程序分 CLI/GUI，`.bat/.cmd/.ps1/.py/.sh/.js` 为脚本，`http(s)` 为链接，无扩展名的带路径项为文件夹）。**不导入**：分类口令、旧主题文件、背景图路径、计划任务字段、图标文件本身（Lucide 名称会保留）。整个过程只读旧版文件。
- 开机启动：设置里开启后由 Tauri autostart 插件写 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`，关闭时移除。
- 浏览器预览（`pnpm dev`）只跑界面：启动程序、托盘、热键、文件对话框会提示需要桌面端。

## 脚本引擎与插件

### 脚本引擎

工具 → 脚本引擎。脚本跑在 **Web Worker 沙箱** 里：没有 DOM，也拿不到 Tauri 的 invoke，只能用下面这些 API。

| API | 作用 |
|---|---|
| `mn.log(...)` | 写入面板输出区 |
| `mn.echo(v)` | 输出结果（脚本返回值也会输出） |
| `mn.notify(text)` | 弹一条提示 |
| `mn.copy(text)` | 复制到剪贴板 |
| `mn.open(目标, 参数)` | 走正常启动链路（与点项目一致） |
| `mn.input` | 面板「输入」框里的内容 |

超时 15 秒自动终止。

```js
mn.log('收到输入：' + mn.input);
mn.echo(mn.input.split('').reverse().join(''));
mn.notify('跑完了');
```

### 插件

工具 → 插件管理。插件就是 `%AppData%\QiBox\plugins\<名字>\` 下的一个文件夹，里面至少有：

```json
{ "name": "示例插件", "version": "1.0.0", "description": "说明", "entry": "main.js", "keywords": "demo" }
```

面板里可以安装（选文件夹后复制进来）、启用/禁用（写 `plugin.<名字>`）、查看脚本、卸载（只删这个插件文件夹）。插件目前是**登记与启停**，不会自动加载执行第三方代码；要试跑脚本请用「脚本引擎」。

## 系统副作用与边界

- 只在用户操作时启动进程；不批量删除文件、不改目标数据库、不读取无关文件。
- 计划任务不会自动注册：任务编辑器里的“生成命令”只给出一行 `schtasks /Create …` 文本，可复制到自己的终端里执行。
- 进程管理器：列表来自本机 `Get-Process`（只读）；点“结束”会先弹确认，确认后调用 `Stop-Process -Force`，不会批量结束任何进程。
- 运行日志：每次启动都会往 `%AppData%\QiBox\logs\launch.log` 追加一行（时间、成功/失败、目标、错误详情）。
- 插件只登记与启停，不会自动加载执行第三方代码；主题文件写出到 `%AppData%\QiBox	hemes\`；手势执行与更新检查仍未接入。
- 分类口令只存在本机配置里，属于便捷拦截，不做加密。

## 目录结构

```text
index.html                 主窗口 DOM
panel.html                 面板窗口 DOM（按需加载同一套样式）
src/main.ts                主窗口入口
src/panel-main.ts          面板窗口入口（解析参数、维护嵌套栈、调整窗口尺寸）
src/state/store.ts         localStorage + BroadcastChannel 状态
src/state/persistence.ts   桌面端读写 %AppData%\QiBox\config.json
src/domain/variables.ts    %mp% 等路径变量展开
src/services/desktop.ts    Tauri 命令封装（窗口、配置、热键、托盘、启动）
src/services/panel-window.ts  主窗口打开面板
src/ui/main-window.ts      渲染、菜单、搜索、批量选择、快捷键
src/ui/panels/*            各面板（设置、编辑器、主题、任务、数据…）
src/styles/base.css        设计稿迁移的视觉主体
src/styles/app-shell.css   窗口几何、拖动区、面板窗口形态
src-tauri/src/lib.rs       Tauri 壳：托盘、单实例、全局热键、开机启动、
                           配置读写与备份、进程启动、面板窗口
```

## 截图

主窗口与面板都可离线截图，无需打开桌面端：

```powershell
pnpm build
pnpm preview --port 4173

# 主窗口（380 × 560）
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --headless=new --disable-gpu --hide-scrollbars `
  --window-size=380,560 --screenshot=shot-main.png `
  --virtual-time-budget=2500 http://localhost:4173/

# 设置面板（650 × 648）
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --headless=new --disable-gpu --hide-scrollbars `
  --window-size=650,648 --screenshot=shot-settings.png `
  --virtual-time-budget=2500 `
  "http://localhost:4173/panel.html?panel=settings&arg=%7B%22page%22%3A%22%E5%B8%B8%E8%A7%84%22%7D"
```

注意：Chrome 无头模式的最小窗口宽度约 500 px，直接 `--window-size=380,560`
会以 512 px 布局后裁切。需要严格的 380 宽截图时，用 CDP 的
`Emulation.setDeviceMetricsOverride` 设置视口后再 `Page.captureScreenshot`。
面板参数 `arg` 是 URL 编码后的 JSON，例如 `{"page":"常规"}`。

## 与设计稿的有意偏差

- 面板改为独立无边框窗口（设计稿中是主窗口内的浮层），避免主窗口被撑大。
- 去掉宿主页面的 `@media (max-width: 560px)` 响应式块：它会把分类栏改成水平排布，破坏已确认布局。窄窗适配改成 `@media (max-width: 399px)` 只收窄分类栏（94px → 82px），不改变结构。
- 去掉点阵背景、模拟最小化/恢复按钮、“界面预览”提示与 `window.openai` 桥接。
- 标题栏是唯一拖动区（`data-tauri-drag-region`），按钮显式 `no-drag`，避免点按钮时拖窗。

