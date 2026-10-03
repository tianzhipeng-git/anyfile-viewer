# 公开文件、README 按钮与 iframe

首版实现于 2026-10-03。2026-10-04 已移除来源域名白名单。网站公开说明页为 `/en/integrations` 和 `/zh-CN/integrations`，页脚和工作区均提供入口，包含可体验按钮、iframe 示例、接入代码及排错说明。在 `/en/view` 或 `/zh-CN/view` 工作区侧栏展开“公开 URL、按钮与嵌入”，输入文件直链并打开，可复制预览链接、Markdown 按钮和 iframe HTML。

## 公开来源与边界

支持任意公开 HTTPS 文件直链，包括作者网站、对象存储、公开数据集、GitHub Raw 和 jsDelivr；没有来源域名白名单。来源需要允许浏览器无凭据 CORS 读取。当前站点 `/samples/` 样例在本地开发时也可使用 HTTP。GitHub 仓库的 `blob` 页面不是文件直链。推荐锁定 commit 或版本，使引用内容稳定。

- 文件直接下载到浏览器，复用现有 `File` 与查看器协议；不上传、不托管、不走代理。
- 下载上限 128 MiB，先检查 Content-Length，再按流累计实际字节数；没有或不准确的长度也不能绕过预算。插件自身解析、像素与内存上限仍生效。
- 不附带 Cookie、Authorization 或 Referer；拒绝 URL 用户名/密码、查询参数、来源片段及重定向。
- 首版只读取主文件，不自动获取材质、配对文件、字体或其他关联资源。需要关联文件的格式应下载后通过本地文件夹打开。
- 自动读取用户指定的公开主文件是 URL 入口的职责，不扩展插件读取任意远程子资源的权限。

## 链接、按钮与 iframe

文件地址经过 URLSearchParams 编码，放在浏览器片段 `#file=` 中。片段不会进入本站 HTTP 请求；不要自行改成 query 参数。生成结果使用当前站点 origin 和当前语言，开发/预览部署中的链接也指向该部署。

公开 Iris CSV 示例：

```text
https://www.anyfile.top/en/view#file=https%3A%2F%2Fraw.githubusercontent.com%2Fmwaskom%2Fseaborn-data%2Fmaster%2Firis.csv
```

```markdown
[![Open in Anyfile](https://www.anyfile.top/brand/open-in-anyfile.svg)](https://www.anyfile.top/en/view#file=https%3A%2F%2Fraw.githubusercontent.com%2Fmwaskom%2Fseaborn-data%2Fmaster%2Firis.csv)
```

```html
<iframe src="https://www.anyfile.top/en/embed#file=https%3A%2F%2Fraw.githubusercontent.com%2Fmwaskom%2Fseaborn-data%2Fmaster%2Firis.csv" title="Anyfile file preview" width="100%" height="600" style="border:0" loading="lazy" allow="fullscreen; cross-origin-isolated" referrerpolicy="no-referrer"></iframe>
```

README 平台一般不支持 iframe，使用 Markdown 按钮；教程或网站可使用 iframe。保持可访问的 title，并按版面调整高度。不会根据本地文件生成分享 URL。

## 隔离与兼容性

`/{locale}/embed` 使用精简页面，无网站导航、页脚和工作区侧栏，标记 noindex。完整查看页和 embed 都保留 COOP same-origin / COEP require-corp；embed 提供 CORP cross-origin，没有禁止第三方嵌入的 X-Frame-Options。

普通父页下的 iframe 可以运行无需跨源隔离的查看器，但 `allow="cross-origin-isolated"` 本身不能让 iframe 获得隔离。需要 SharedArrayBuffer/pthread 的格式要求父页和整个祖先链满足隔离条件并允许相应 Permissions Policy；否则使用顶部“在新窗口打开”入口。模块 Worker、WASM、WebGL 或解码器是否可用仍取决于对应插件与浏览器，不作全格式兼容承诺。参见 [Chrome 隔离说明](https://github.com/GoogleChrome/web.dev/blob/main/src/site/content/en/blog/coop-coep/index.md)。

## 测量与隐私

GA4 的预览事件沿用既有结果口径，新增 `file_source=remote`，站内样例继续为 `sample`。片段入口的 `task_entry=public_url`，嵌入为 `embed`。引荐只保留外站 origin；GA4 和 Speed Insights 的页面地址只保留应用路由。文件 URL、文件名、内容与原始错误不会作为事件参数发送。下载完成不等于目标预览成功，仍依赖插件 `reportPreview`。

## 验收记录

- `pnpm test:app`：13 个测试文件、114 项测试通过，包含HTTPS 和凭据限制、编码、无凭据 fetch、响应长度与流式超限、取消、HTTP 失败，以及 GA4 公开入口归因与 URL 脱敏。全项目 `pnpm test` 共 982 项测试通过；`pnpm lint`、TypeScript 与生产构建（含插件、资产与首包门禁）通过。
- 公开 Iris CSV 响应已核对 HTTP 200、Access-Control-Allow-Origin: *、CORP cross-origin。
- 真实 Chrome：公开 Iris CSV 的片段链接自动打开，Excel 查看器显示 151 行（含表头）；侧栏生成三种代码。
- 真实 Chrome 跨源 iframe：父页 `localhost:3001` 无 COOP/COEP，子页 `localhost:3000/en/embed`；Excel 表格正常显示，网站导航/页脚/侧栏隐藏。切换到 DuckDB 后显示类型化字段与数据，验证此 Worker/WASM 路径成功，浏览器无 error/warn。
- 本地 embed 响应已核对 COOP same-origin、COEP require-corp、CORP cross-origin。
- 放开来源后的真实 Chrome 验证：原白名单外的 Wikimedia `Example.jpg` 成功显示为 172 × 178 JPEG；工作区文案和代码生成正常。中英文 `/integrations` 页面可访问，工作区到说明页采用完整导航，中文说明页的实时 iframe 显示 Iris CSV。
- 线上响应头、手机、需要隔离的 Worker/WASM、实际作者采用及增长结果仍需部署后验证。
