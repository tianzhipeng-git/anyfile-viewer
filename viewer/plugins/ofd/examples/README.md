# 样例

均来自 [ofdrw](https://github.com/ofdrw/ofdrw) 测试集，Apache-2.0。

| 文件 | 上游路径 | 用途 |
|---|---|---|
| `invoice-sample.ofd` | `ofdrw-converter/src/test/resources/发票示例.ofd` | 增值税电子普通发票：页面区域覆盖文档 PageArea、背景模板、DrawParam、QR 码 PNG、注释、`g n v` 增量与嵌套印章 OFD（SignedValue.dat） |
| `ses-v4-seal.ofd` | `ofdrw-sign/src/test/resources/SESV4SignDoc.ofd` | GB/T 38540 V4 签名值中的 PNG 印章 |
| `embedded-font-outline.ofd` | `ofdrw-converter/src/test/resources/z.ofd` | 4 页：内嵌 TrueType 字体、`CGTransform` 连字/多字形簇、大纲与图片 |
| `composite-clip.ofd` | `ofdrw-converter/src/test/resources/signout.ofd` | 复合图元（手写批注）、裁剪区与 CTM |
