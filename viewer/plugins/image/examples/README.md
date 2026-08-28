# 测试样例清单

样例均由 `node viewer/plugins/image/scripts/generate-examples.mjs` 通过 ImageMagick 从纯色渐变生成，不含第三方版权素材。

| 格式 | 正常样例 | 异常样例 |
|---|---|---|
| JPEG | `sample.jpg`（baseline） | `truncated.jpg`、`corrupt.jpg` |
| PNG | `sample.png`（RGBA） | `truncated.png`、`corrupt.png` |
| APNG | `animated.apng`（ImageMagick 生成的 14 帧循环） | `truncated.apng` |
| GIF | `animated.gif`（2 帧循环） | `truncated.gif`、`corrupt.gif` |
| WebP | `sample-lossy.webp`、`sample-lossless-alpha.webp`、`animated.webp`（2 帧循环） | `truncated.webp`、`corrupt.webp` |
| AVIF | `sample.avif`（单帧） | `truncated.avif`、`corrupt.avif` |

真实渲染 smoke test 使用这些正常文件验证浏览器解码、尺寸与动画挂载；损坏和截断文件必须被 probe 拒绝，直接调用插件时必须返回 `invalid-file`。
