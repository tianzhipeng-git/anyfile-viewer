# 公开文件、README 按钮与 iframe

网站公开说明页位于 `/en/integrations` 与 `/zh-CN/integrations`。在 `/en/view` 或 `/zh-CN/view` 工作区侧栏点击“打开链接 / Open link”，输入公开文件直链即可打开并生成预览链接、README Markdown 按钮与 iframe 嵌入代码。

## 1. 公开来源与安全边界

- 支持任意允许无凭据 CORS 读取的公开 HTTPS 文件直链（含作者网站、对象存储、GitHub Raw、jsDelivr；无域名白名单）；本站 `/samples/` 在本地开发时亦可使用 HTTP。GitHub `blob` 页面不是文件直链，建议锁定 commit 或版本。
- 文件由浏览器直接下载并复用现有 `File` 与查看器协议，不上传、不托管、不走服务端代理。
- 下载上限 **128 MiB**：先核对 `Content-Length`，再按流累计实际字节数（缺失或不准确的长度无法绕过）；插件自身的解析、像素与内存预算继续生效。
- 请求不携带 Cookie、Authorization 或 Referer；拒绝含用户名/密码、查询参数、来源片段及重定向的 URL。
- 仅读取用户指定的主文件，不自动请求材质、配对文件、字体等远程关联资源；多文件格式应下载后通过本地文件夹打开。

## 2. 链接、按钮与 iframe 规范

文件地址经 `URLSearchParams` 编码后置于浏览器片段 `#file=` 中，不进入本站 HTTP 请求（不要改为 query 参数）：

```text
https://www.anyfile.top/en/view#file=https%3A%2F%2Fraw.githubusercontent.com%2Fmwaskom%2Fseaborn-data%2Fmaster%2Firis.csv
```

```markdown
[![Open in Anyfile](https://www.anyfile.top/brand/open-in-anyfile.svg)](https://www.anyfile.top/en/view#file=https%3A%2F%2Fraw.githubusercontent.com%2Fmwaskom%2Fseaborn-data%2Fmaster%2Firis.csv)
```

```html
<iframe src="https://www.anyfile.top/en/embed#file=https%3A%2F%2Fraw.githubusercontent.com%2Fmwaskom%2Fseaborn-data%2Fmaster%2Firis.csv" title="Anyfile file preview" width="100%" height="600" style="border:0" loading="lazy" allow="fullscreen; cross-origin-isolated" referrerpolicy="no-referrer"></iframe>
```

不会为本地文件生成分享 URL。

## 3. 跨源隔离与测量

- `/{locale}/embed` 隐藏站点导航、页脚和工作区侧栏并标记 `noindex`，与 `/view` 一样返回 `COOP: same-origin` 与 `COEP: require-corp`，同时提供 `CORP: cross-origin`（不设置禁止第三方嵌入的 `X-Frame-Options`）。
- 非隔离父页中的 iframe 可运行无需跨源隔离的查看器；需要 `SharedArrayBuffer`/pthread 的格式要求整个祖先链满足隔离与权限策略，否则需通过顶部“在新窗口打开”查看。
- GA4 事件记录 `file_source=remote`（本站 `/samples/` 为 `sample`）、`task_entry=public_url` 或 `embed`；不发送完整来源 URL、文件名或文件内容。
