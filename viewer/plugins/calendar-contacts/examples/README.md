# 样例

| 文件 | 来源 | 用途 |
|---|---|---|
| `team-calendar.ics` | 用 Python `icalendar` 7.3.2 生成的原创样例 | 覆盖 UTC、`TZID`、`VALUE=DATE`、`RRULE`、`VALARM`、`VTODO`、组织者/参与者与转义文本 |
| `single-event.ics` | 用 Python `vobject` 生成的原创样例 | 覆盖无时区的浮动时间与单个 `VEVENT` |
| `contact-single.vcf` | 用 Python `vobject` 生成的原创样例 | 覆盖 vCard 3.0 的 `FN`/`N`/`ORG`/`TEL`/`EMAIL`/`ADR`/`URL`/`NOTE` |
| `contacts-android-v21.vcf` | ez-vcard 测试集 `John_Doe_ANDROID.vcf`（Apache-2.0，https://github.com/mangstadt/ez-vcard） | 真实 Android 导出的 vCard 2.1：6 张名片、quoted-printable 姓名、多类型电话 |
| `contact-outlook-v21.vcf` | ez-vcard 测试集 `John_Doe_MS_OUTLOOK.vcf`（Apache-2.0） | 真实 Outlook 导出的 vCard 2.1：折行的 Base64 照片、`ADR`/`LABEL`、多类型电话 |
| `truncated-calendar.ics` | `team-calendar.ics` 的前 420 字节 | 负样例：在组件中途截断，仍应展示已读到的日程 |
| `truncated-contacts.vcf` | `contact-single.vcf` 去掉 `END:VCARD` | 负样例：缺少结束行的名片仍应按已读属性展示 |
| `disguised-text.vcf` | 纯文本文件改名为 `.vcf` | 负样例：无 `BEGIN:VCARD`，必须被拒绝并回退十六进制 |

真实导出文件按其来源许可证（Apache-2.0）分发并在此注明出处；其余文件由本仓库用 icalendar / vobject 生成。
