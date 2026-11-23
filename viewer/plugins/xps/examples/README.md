# 样例

| 文件 | 来源与许可 | 用途 |
|---|---|---|
| `testPPT.xps` | [Apache POI](https://github.com/apache/poi) 测试集 `test-data/slideshow/testPPT.xps`，Apache-2.0；由 Microsoft XPS Document Writer 打印 PowerPoint 生成 | UTF-16 部件、`.odttf` 混淆 TrueType 字体、仅含步进的 `Indices`、`MatrixTransform` 子元素与 3 页幻灯片 |
| `ghostscript-shapes.xps` | 本项目原创 PostScript 经 Ghostscript `xpswrite` 设备生成（`gs -sDEVICE=xpswrite`） | 纵向/横向混合页尺寸、描边路径、`ColorConvertedBitmap` TIFF 图片画刷与 Ghostscript 风格的路径化文字 |

OpenXPS 命名空间、交错 `[n].piece` 部件、远程资源字典、渐变、`PathGeometry` 与目录由 `src/test-fixtures.ts` 在测试中构造。
