# 样例

| 文件 | 内容 | 用途 |
|---|---|---|
| `Abel-Regular.ttf` | Abel Regular，`glyf` 轮廓的 TrueType | `.ttf` 正常样例，元数据与试打预览 |
| `Abel-Regular.woff` | 同一字体的 WOFF 封装（仅换容器，字形与名称表未改动） | WOFF zlib 解压路径 |
| `Abel-Regular.woff2` | 同一字体的 WOFF2 封装 | WOFF2 表目录与浏览器渲染路径 |
| `SourceSans3-Regular.otf` | Source Sans 3 Regular，`CFF ` 轮廓的 OpenType | `.otf` 正常样例 |
| `OFL-Abel.txt` | Abel 的 SIL Open Font License 1.1 全文 | Abel 的许可证 |
| `LICENSE-SourceSans.md` | Source Sans 的 SIL Open Font License 1.1 全文 | Source Sans 的许可证 |

- Abel 来自 <https://github.com/google/fonts/tree/main/ofl/abel>，保留字体名 Abel。
- Source Sans 3 来自 <https://github.com/adobe-fonts/source-sans>（release 分支的 `OTF/SourceSans3-Regular.otf`），保留字体名 Source。
- WOFF / WOFF2 由 `fontTools` 从 `Abel-Regular.ttf` 转换容器格式生成，未修改字形、度量与名称表；重新生成：

```sh
python3 - <<'PY'
from fontTools.ttLib import TTFont
for flavor in ("woff", "woff2"):
    font = TTFont("Abel-Regular.ttf")
    font.flavor = flavor
    font.save(f"Abel-Regular.{flavor}")
PY
```
