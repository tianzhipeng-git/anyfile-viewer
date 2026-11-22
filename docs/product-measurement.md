# 产品测量

线上站点使用 GA4 `G-289W10FK5X` 与 Vercel Speed Insights。

## 1. 采集与隐私边界

- 仅 production 构建且域名为 `anyfile.top` / `www.anyfile.top` 时启用；开发环境、localhost 与 Vercel Preview 不采集。
- 采用默认启用、可随时停用（opt-out）模式：访客可在隐私页停用或重新启用，偏好保存在浏览器本地存储；停用不影响文件查看，且停用期间不积压、不补发事件。
- 关闭 GA4 增强型衡量，由代码手动发送 `page_view`，避免 SPA 重复计数及自动外链/下载采集。
- 页面地址仅保留受控站内路径，外部 referrer 仅保留 origin；**不发送** query、hash、用户文件名、文件内容、本地路径、原始错误或完整远端文件 URL。
- 未知扩展名归 `unknown`，复合扩展名按最长匹配识别；关闭 Google Signals 与广告个性化，不设置 User-ID 或高基数 attempt ID；未采集 UTM 参数。

## 2. 事件定义

| 事件 | 含义 |
|---|---|
| `page_view` | 启用状态下的首次页面访问及 pathname 切换 |
| `workspace_enter` | 进入 `/view` 或 `/embed`，携带白名单 `task_entry` |
| `file_selected` | 成功取得待查看文件（批量选取仅当前文件计数） |
| `file_picker_cancelled` | 文件或目录选择器取消，不计失败 |
| `open_started` | 进入路由/探测前开始一次尝试（手动切换插件另计） |
| `viewer_initialized` | `open()` 返回控制器（不等于预览成功） |
| `open_result` | 一次尝试的首个结果：`success` / `failure` / `cancelled` / `fallback` / `unmeasured` |
| `video_playback` | 实际播放启动，每次尝试最多一次，独立于首帧 |
| `animation_control` | 用户主动触发播放/暂停/逐帧/调速，同次打开每种 `action` 最多一次 |
| `preview_error` | 首次结果之后的整体预览错误，单独计数不覆盖首个结果 |

- 通用字段：`task_entry`（白名单校验；直接访问 `direct`、公开链接 `public_url`、嵌入 `embed`）、`file_source`（显式指定 `user` / `sample` / `remote`，绝不从文件名推断）、`format`、`size_bucket`（`<1 MiB` / `1–10 MiB` / `10–100 MiB` / `100 MiB–1 GiB` / `>=1 GiB`），路由后增加 `plugin`。
- 结果字段：`outcome`、`preview_kind`、`reason_code`、`duration_ms`（从路由/初始化到首个结果）。

## 3. 结果覆盖与 GA4 报表配置

- **已覆盖结果信号**：`browser-image`（`static`/`animation`）、`photoshop-document`（`static`）、`mesh-3d`（首次有效 WebGL 绘制 `static`）、`insta360`/`gopro-max`/`dji-osmo`（`static`/`video_frame` + `video_playback`）、`hex-viewer`（固定计 `fallback`）。其余插件仅记录初始化和显式失败，初始化后离开计 `unmeasured`。
- **GA4 资源**：资源 `556331864` / 数据流 `15861388657`（关闭增强型衡量）。
  - 自定义维度：`task_entry`、`file_source`、`format`、`plugin`、`size_bucket`、`outcome`、`preview_kind`、`reason_code`（`animation_control` 的 `action` 维度如用于报表须在后台注册）。
  - 自定义指标：`duration_ms`（毫秒）。
- 报表统计须按 `file_source` 区分 `user`、`sample`、`remote`，不将 `open_result` 整体标为关键事件（含失败记录）；搜索控制台与站内事件分别统计。
