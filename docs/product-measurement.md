# 产品测量（S1）

2026-09-29 接入 GA4 `G-289W10FK5X`，替代 Vercel Web Analytics；保留 Speed Insights。

## 采集边界

仅 production 构建且域名为 `anyfile.top` / `www.anyfile.top` 时启用。开发环境、localhost、Vercel Preview 不采集。访客明确允许后才加载 Google tag；拒绝不影响查看。页脚可修改分析偏好。拒绝期间不积压、补发事件；若一次打开在同意前开始，该次尝试不补发结果。分析结果只代表实际采集到的访问，不是全站完整人口统计。

关闭 GA4 数据流的增强型衡量，由代码手动发送页面事件，避免 SPA 页面重复计数及下载/外链/站内搜索等自动采集。页面地址只保留受控站内路径，外部 referrer 只保留 origin；不发送 query、hash、用户文件名、文件内容、路径、原始错误、完整远端文件 URL。未知扩展名归 `unknown`，已知复合扩展名按最长匹配识别。Google Signals 和广告个性化关闭。不设置 User-ID，不上报高基数 attempt ID。

当前来源分析使用 GA4 自带来源/媒介及脱敏 referrer；未采集 UTM 查询参数，因此不提供推广活动级归因。搜索控制台与站内数据分开报告。

## 事件

| 事件 | 含义 |
|---|---|
| `page_view` | 同意后的首次页面访问及 pathname 切换；每次路由访问一次 |
| `workspace_enter` | 进入 `/view`，携带白名单 `task_entry` |
| `file_selected` | 成功取得待查看文件；批量选取后仅选中的当前文件计数 |
| `file_picker_cancelled` | 浏览器文件选择器或目录选择器明确取消；不计打开失败 |
| `open_started` | 文件进入路由/探测前开始一次尝试；手动切换插件另算一次 |
| `viewer_initialized` | `open()` 返回控制器；不等于预览成功 |
| `open_result` | 一次尝试的首个结果：success / failure / cancelled / fallback / unmeasured |
| `video_playback` | 实际播放启动，每次尝试最多一次，独立于首帧 |
| `preview_error` | 首次结果之后发生的整体预览错误；单独计数，不覆盖首个结果 |

通用字段：`task_entry`、`file_source`、`format`、`size_bucket`；路由选定后增加 `plugin`。结果字段为 `outcome`、`preview_kind`、`reason_code`、`duration_ms`。

`task_entry` 从站内链接的 `entry` 参数得到，并再次按白名单验证；保留跨 COOP/COEP 边界的完整导航。直接访问为 direct。`file_source=user|sample` 由调用方明确提供，绝不根据文件名推断。当前工作区只有用户文件入口；后续样例入口须显式传 `fileSource="sample"`，并在选择事件使用相同来源。

`duration_ms` 包含路由与初始化到首个结果的时间；插件手动重选从该次重新打开开始。大小分组按二进制单位：小于 1 MiB、1–10 MiB、10–100 MiB、100 MiB–1 GiB、1 GiB 以上。

## 成功覆盖及限制

- browser-image：图片完成解码并挂载，区分 static / animation。
- photoshop-document：PSD/PSB 合成图已交给视口，static。
- Insta360 / GoPro MAX / DJI Osmo：照片或静态回退为 static；视频首帧为 video_frame；实际播放另发 video_playback。
- Hex 初始化完成记 fallback，任何入口都不把它算目标任务成功。
- 其余插件仅记录初始化和显式失败；初始化后离开且没有结果信号时记 unmeasured，不能计入成功或失败。初始化前切换记 cancelled。
- 关闭标签页、浏览器崩溃或网络拦截可能丢失结果，不通过超时推断失败。`open_started` 与结果数可能不一致。
- 取消后忽略旧实例回调；成功后切换文件不追加取消。后台错误与最初可用的预览分别报告。

## GA4 报表配置

已在资源 `556331864` / 数据流 `15861388657` 后台关闭增强型衡量，保存以下定义（2026-09-29）；尚未发布代码，未验证线上收数。

事件级自定义维度：task_entry、file_source、format、plugin、size_bucket、outcome、preview_kind、reason_code。

事件级自定义指标：duration_ms，毫秒。发送参数不等于能在报表直接使用，必须先注册。新维度通常需等待处理后才能用于报告。

首份自由形式探索建议：行 task_entry / format，列事件名称或 outcome，值事件数；筛选 file_source=user。分别保存打开结果和失败原因视图。目标入口访问使用 page_view 的页面路径；不要把访问次数、用户数、选文件次数、打开尝试混为同一分母。

目标成功率只针对已覆盖结果信号的格式报告，同时列出 success、failure、cancelled、fallback、unmeasured 和无结果数。视频首帧成功率与实际播放率分开。当前不把 open_result 整个事件标记为关键事件，因为它同时包含失败等结果。

## 验收

自动测试覆盖初始化不等于成功、重复信号去重、成功后切换、失败、取消、样例来源、Hex、视频首帧与播放、晚到错误、脱敏及入口白名单。插件测试使用 mock，不能代替真实 WebGL/解码验收。

上线后使用真实 Chrome 和公开测试素材：

1. 拒绝分析时没有 Google tag / collect 请求；允许后当前页面只有一个 page_view。
2. PSB/APNG/全景入口进入工作区，entry 正确且 crossOriginIsolated 仍为 true。
3. 正常预览、损坏文件、打开途中快速切换、未知文件 Hex 各有正确结果；首帧和点击播放分开。
4. 网络面板核对请求无文件名、内容、完整 URL 或原始错误；GA4 实时报告确认事件到达。
5. 首次切换后按 GA4 新基线观察，历史 Vercel 数据只作参考。部署完成后关闭 Vercel 后台 Web Analytics 开关。
