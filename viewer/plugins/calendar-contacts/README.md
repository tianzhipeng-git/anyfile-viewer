# 日历与联系人查看器 (`calendar-contacts`)

## 基本介绍

- **插件 ID**：`calendar-contacts`
- **格式入口**：`.ics`（iCalendar）、`.vcf`（vCard）

在浏览器本地读取 iCalendar 日历与 vCard 联系人名片。日历按开始时间列出日程、地点、组织者、参与者、重复规则与提醒，并单独列出待办任务；联系人以名片网格展示姓名、组织、职位、电话、邮箱、地址、网址、备注与生日。两者都支持即时筛选。

## 实现原理

- `src/parse.ts`：按 RFC 5545 / 6350 折叠规则还原逻辑行，解析属性行与参数（含带引号的多值参数），处理 quoted-printable（`CHARSET` 指定的字符集）与 `\n`、`\,`、`\;` 转义，最后构建组件树。
- `src/calendar.ts`：把 `VEVENT` / `VTODO` 映射为日程模型，解析 `DATE`、`DATE-TIME`、`Z` 与 `TZID` 时间，按开始时间排序。
- `src/contacts.ts`：把 `VCARD` 映射为联系人模型，解析 `N`、`FN`、`ORG`、`TEL`、`EMAIL`、`ADR`、`URL`、`NOTE`、`BDAY`、`CATEGORIES`，并标记内嵌照片存在。
- `src/calendar-view.ts`、`src/contacts-view.ts`：原生 DOM 列表/网格 + 即时筛选，全部通过 `textContent` 构建；`<details>` 提供可访问的详情展开。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |

没有第三方解析器、Worker、WASM 或网络请求。

## Agent extract

[src/extract.ts](src/extract.ts) 在 Node worker 内复用 [src/document.ts](src/document.ts) 的同一解析：

- `inspect`：日历名、时区、PRODID、事件/待办数、最早与最晚开始时间、组件计数；vCard 返回版本与联系人数。
- `read` 目标：`events`、`tasks`（日历）或 `contacts`（vCard），每项一个 Markdown 小节；`line:` 游标按项分页，支持 `filter`。内嵌照片只标注存在，不输出数据。不支持 `render`。

## 已知限制

- 重复日程只展示规则，不展开实例；时区按文件中的写法展示，不换算成本地时间。
- 不渲染附件、内嵌图片/照片与二进制属性；自定义 `X-` 属性不展示。
- 文件按 UTF-8 文本读取，缺少字符集声明的旧文件可能乱码。
- 单文件上限 32 MiB；最多展示 5,000 条日程、2,000 条任务、2,000 张名片（列表渲染上限 800 / 200 / 500 条）。

## 开发与验证

- [格式声明](src/manifest.ts)、[探测](src/probe.ts)、[属性行解析](src/parse.ts)、[日历映射](src/calendar.ts)、[联系人映射](src/contacts.ts)、[日历视图](src/calendar-view.ts)、[联系人视图](src/contacts-view.ts)。
- [样例目录](examples/)：包含 icalendar / vobject 生成的日历与名片、从 ez-vcard 测试集取得的真实 Android 与 Outlook 导出，以及负样例。
- 可用 `icalendar`、`vobject` 或系统日历应用复核字段。

在仓库根目录运行插件测试：

```bash
pnpm test viewer/plugins/calendar-contacts
```
