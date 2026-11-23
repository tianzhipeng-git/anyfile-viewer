# 样例

两个文件描述同一份虚构应用配置，用于验证二进制与 XML 两种 plist 解析结果一致。

| 文件 | 来源 | 用途 |
|---|---|---|
| `app-config.binary.plist` | 用 macOS `plutil -convert binary1` 由 `app-config.xml.plist` 生成 | 二进制 `bplist00` 解析：字典、数组、字符串、布尔、整数、实数、日期与 data（base64） |
| `app-config.xml.plist` | 手写的 XML plist（公开 DTD） | XML plist 解析与实体/嵌套结构 |
