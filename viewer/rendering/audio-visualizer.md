# AudioVisualizer 曲线绘制说明

范围：[`src/audio-visualizer.ts`](src/audio-visualizer.ts)，子入口 `@anyfile/viewer-rendering/audio`。
调用方：`browser-audio`（`media` 模式）、`non-native-audio`（`node` 模式）。

本文只讲“曲线是怎么画出来的”、“点击画布怎么切效果”和“想换效果该改哪个文件”。生命周期、AudioContext 所有权和加载边界见
[共享 UI 与渲染架构](../../docs/viewer-ui-and-rendering-architecture.md) 与
[音频查看架构](../../docs/audio/architecture.md)。

## 数据源

- Web Audio `AnalyserNode`，`fftSize = 2048` → 1024 个频谱 bin / 2048 个时域采样。
- 只读实时帧，**不**解码整文件、**不**扫描全文件峰值（音频架构的硬约束）。
- 频谱模式用 `getByteFrequencyData`（每 bin 0..255）；时域模式用 `getFloatTimeDomainData`（每采样 -1..1）。

## spectrum 模式（默认）

逐 CSS 像素列画一条单折线，步骤：

1. **帧间平滑**：`smoothingTimeConstant = 0.72`。"弹跳感"主要来自 AnalyserNode 内部的帧间指数平滑，不是本文件做的。
2. **高频截断**：只取前 `floor(bins * 0.7)` 个 bin。音乐的高频段幅度接近 0，不截掉曲线右半会死平。
3. **频率 → X**：`index = floor(ratio ^ 1.6 * usable)`，`ratio = x / (width - 1)`。
   幂曲线（指数 1.6）让低频占据更多横向宽度，近似对数频率轴；线性映射会让能量都挤在最左几像素。
4. **幅度 → Y**：`y = baseline - (bin / 255) * amplitude`，线性映射，`baseline` 在画布底部，所以曲线从底向上"跳"。
5. **连线**：每列 `moveTo`/`lineTo` 一个点，`lineJoin`/`lineCap` 取 round。
   没有列内 min/max 聚合、没有峰值保持（peak hold）、没有插值——一列就是一个采样点。

## waveform 模式

示波器观感（比 spectrum 更刺眼，所以多两层降速，不只靠 Analyser）：

1. `smoothingTimeConstant = 0`（时域不走 Analyser 帧间平滑）。
2. **过零触发**：在缓冲前半段找第一个上升沿（`prev < 0 && curr >= 0`），从该采样起算；找不到则 `start = 0`。
3. **降采样率**：大约每 4 个 rAF 才重新读一次时域（~15 Hz）；中间帧重画上一份平滑路径，避免 60 Hz 换形。
4. **路径 EMA**：新采样以 `alpha ≈ 0.22` 混进上一帧的 Y 路径（首帧或宽度变化时 `alpha = 1` 直接种子）。
5. **X / Y**：从 `start` 起 `step = (samples.length - start) / width` 每列取一个采样。
   真实音乐很少顶到 ±1，所以先对**本窗绘制采样**取峰值，再按 `scale = (height/2 * 0.92) / max(peak, 0.04)`
   映射到 Y（静音地板避免把底噪放大成满幅），最后走路径 EMA。

## waves 模式

多线条大波浪（频带能量驱动的合成正弦带，不是原始时域叠画）：

1. `smoothingTimeConstant` 与 spectrum 相同（默认 0.72）。
2. **分频带**：在截断后的 usable bins 上按 `[0, 8%, 25%, 50%, 100%]` 切成 4 带，每带取均值归一化到 0..1。
3. **电平 EMA**：`level[i] = level[i]*(1-α) + energy[i]*α`，`α ≈ 0.09`，比 waveform 路径 EMA 更慢，浪才"大而稳"。
4. **合成形状**：每条线是
   `y = center + offset + A·sin(2π·cycles·t + φ) + 0.25·A·sin(4π·cycles·t + …)`；
   频谱只当振幅旋钮，形状由正弦生成。`cycles` 低音疏、高音密（约 0.7 → 3.0），`offset` 轻微上下错开。
5. **相位漂移**：`φ` 每帧按 `0.012 + Σlevel·0.022` 推进，浪在横向慢走而不是原地抖。
6. **绘制**：自后向前 4 次 `stroke`，`globalAlpha` 约 `0.25 → 0.9`；列步长 2 CSS 像素。只描边，不填充。

## 静止态与动画循环

- 没有 tap、暂停、或 `prefers-reduced-motion: reduce`：只画一条静止基线
  （spectrum 在底部，waveform / waves 在中线），**不**启动 `requestAnimationFrame`。
- 播放中：draw 回调内部再调 `surface.schedule()` 自续帧；一旦 inactive 循环自然停止。
- 画布被 CSS 隐藏（`clientWidth === 0`）时不自续帧，靠 `CanvasSurface` 的 `ResizeObserver` 在重新可见时恢复。
- DPR：先 `setTransform(dpr, 0, 0, dpr, 0, 0)` 再全部用 CSS 像素绘制。
  `CanvasSurface` 只设 backing store 尺寸、不设 transform，漏掉这行会让曲线只画出左上 1/dpr 区域。

## 运行时切换：画布本身就是开关

不需要额外按钮，用户点击画布即可换效果：

- `click`，或画布获得焦点后按 `Enter` / `Space`，按 `MODES` 的顺序切到下一个效果
  （当前 spectrum → waveform → waves → spectrum）。
- `AudioVisualizerMode` 由 `MODES` 派生，新增效果时改这一处，类型和点击循环顺序会一起跟上。
- 切换后立刻补一帧：`analyser` 已存在时按新模式重设 `smoothingTimeConstant`（spectrum / waves 用 `smoothing`，waveform 用 0），
  再 `surface.schedule()`。空闲态和 reduced-motion 本来没有循环，少了这一步静止基线不会从底部跳到中线。
- 键盘激活必须自己实现：canvas 不是原生控件，浏览器不会把 `Enter`/`Space` 转成 `click`；
  `Space` 还要 `preventDefault()`，否则页面会跟着滚一屏。
- 两个监听都登记在 `ResourceScope` 上，`dispose()` 一并移除，切换不会重启已有的动画循环。

**只共享行为，不共享 DOM 属性。** “让画布变成可交互控件”那一半仍在插件侧，两个音频插件各自设置：

| 归插件（各插件 `ui.ts`） | 为什么不在本文件 |
|---|---|
| `role="button"`、`tabindex="0"` | canvas 和它的属性归调用方所有，本文件只在这个元素上挂监听 |
| `aria-label`、`title` | 文案要本地化，i18n 在插件侧；`title` 同时承担“这里能点”的可发现性 |
| `cursor: pointer`、`:focus-visible` 轮廓 | 本文件不注入 `<style>`；渲染规范要求可交互画布可键盘操作且有可识别名称 |

漏掉 `tabindex` 不会报错，只会静默失去键盘可达性——鼠标点击照常生效，所以这三项容易被忘，两个插件的
`index.test.ts` 各有一条断言盯着它们。窄屏 media query 把画布 `display: none` 时它自然退出 tab order，无需额外处理。

## 切换 / 调整效果时改哪里

| 想改的东西 | 改哪个文件 |
|---|---|
| 初始效果（两个插件一起改） | `audio-visualizer.ts` 构造里的 `options.mode ?? "spectrum"` 默认值；用户仍可在运行时点击画布切走 |
| 只让某一个插件的初始效果不同 | 该插件调用处传 `new AudioVisualizer(canvas, { mode: "waveform" })`，一行 |
| 运行时点击 / 键盘切换的行为本身 | `audio-visualizer.ts` 的 `cycleMode()` 与 `onActivateKey()` |
| 曲线形状、平滑度、频率分布指数、高频截断比例、幅度、线宽、波浪频带/周期/透明度 | `audio-visualizer.ts`（`trace*` 方法体、顶部 `WAVE_*` 常量或构造默认值） |
| 新增一种效果 | `audio-visualizer.ts`：`MODES` 里加一个值（类型与点击循环顺序自动跟上）+ 对应 `trace*` 方法 + `paint` 里的分支 |
| 画布高度、宽度、与播放控件的间距、摆放位置 | 各插件 `ui.ts` 的 CSS，**不在**本文件 |
| 画布的可交互外观与无障碍名称（`role`/`tabindex`/`aria-label`/`title`/`cursor`/焦点环） | 各插件 `ui.ts`，**不在**本文件 |
| 曲线颜色 | 各插件给 canvas 设的 `color`（本文件读 `getComputedStyle(canvas).color`，默认回退 `#111`） |

结论：**效果的算法、外观和切换交互只需要改 `audio-visualizer.ts`**；需要碰插件侧的只有三类——
“某个插件的初始效果不同”（一行调用参数）、“画布几何/颜色”（CSS），以及“画布作为控件的无障碍属性”（属性 + CSS）。

## 明确不做

- 不解码 PCM、不生成整轨 waveform 总览；
- `node` 模式不创建也不关闭调用方的 AudioContext，只挂旁路；
- 不创建 DOM、不注入 `<style>`、不写 canvas 的属性，canvas 与其 CSS、`role`/`tabindex`/`aria-label`/`title` 归插件所有
  （本文件只在这个 canvas 上挂 `click` 与 `keydown`）；
- 不做峰值保持、不做列内 min/max 聚合、不做曲线插值——spectrum / waveform 保持单折线轻量实现；waves 用合成正弦，仍不走样条插值；
- 不提供切换效果的按钮、菜单或模式指示器，也不把当前 mode 暴露给插件——切换只通过画布自身完成。
