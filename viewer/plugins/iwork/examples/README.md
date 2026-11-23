# 样例

全部取自 [Apache Tika](https://github.com/apache/tika) 测试集（`tika-parser-apple-module/src/test/resources/test-documents`），Apache-2.0 许可。

| 文件 | 用途 |
|---|---|
| `testPages2013.pages` | Pages 2013+ IWA：正文、文本框、`preview.jpg` |
| `testKeynote2013.key` | Keynote 2013+ IWA：3 张幻灯片、`st*` 缩略图、演讲者备注、标题占位符排序 |
| `testKeynote2018.key` | 打包为 `Presentation.key/Index.zip` 的 Keynote 软件包 |
| `testPages.pages` | iWork '09 Pages XML（`index.xml`）与 `QuickLook/Thumbnail.jpg` |
| `testKeynote.key` | iWork '09 Keynote XML（`index.apxl`）与 `thumbs/` 缩略图 |
| `testPagesPwdProtected.pages` | 密码保护的 iWork '09 文稿，打开时应提示不支持 |
