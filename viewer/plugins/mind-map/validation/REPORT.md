# 公开思维导图文件验证

验证日期：2026-10-16。下载位置：`/workspace/mind-map-public-validation/`。

## 结果

| 格式 | 有效文件 | 打开结果 |
| --- | ---: | --- |
| XMind（旧版 XML / 新版 JSON） | 4 | 全部通过 |
| MindManager | 21 | 全部通过 |
| FreeMind / Freeplane | 8 | 全部通过 |

33 个有效文件共解析 **3,364 个主题、163 个带备注主题、77 个带链接主题**。另有 3 个 `.mm` 测试片段以 `<node>` 为根，缺少标准 `<map>` 包装：probe 返回 0，直接 open 返回 `invalid-file`，作为负例通过。它们不计入有效文件通过率。

## 验证方法与发现

- 通过 GitHub 仓库搜索定位公开文件，下载后记录固定提交 URL、SHA-256 和大小。二进制保留在工作区外部样本目录，不随插件重新分发。
- 用 Python 标准库 `zipfile`、`json`、`xml.etree.ElementTree` 独立统计 XML/JSON 主题数和画布数，将结果保存为固定断言；测试实际调用插件 probe、readMindMap 和 open，核对计数、根标题、首个分支导航、abort 与重复 dispose。
- 全部输入在测试前验证 SHA-256。未执行下载仓库中的程序、宏或文件内主动内容，也未请求脑图里的链接或外部图片。
- 首轮 30 个有效文件通过；XMind Zen 少读取 1 个 `callout` 主题，XMind 2026 少读取 1 个 `summary` 主题。修复 JSON children 读取并增加独立回归用例后，两者主题数分别为 28 和 42，均与源文件一致。其后补入 1 个 mindr FreeMind 样本，最终有效样本为 33 个。
- Freeplane 官方用户指南包含 **1,516 个主题**，用于验证超过小型合成样本的真实层级。空标题可能来自原图中的图片节点或空白节点；当前仍不还原图片。
- 这是实文件解析和 Happy DOM 挂载测试，**不是 Chrome 可视化验收**。原始排版、图片、附件及关联线仍不在声明范围内；不据此宣称完整兼容所有软件版本。

## 复现

在仓库根目录执行：

```bash
python3 viewer/plugins/mind-map/validation/download-samples.py /workspace/mind-map-public-validation
MIND_MAP_PUBLIC_SAMPLES=/workspace/mind-map-public-validation corepack pnpm --filter @anyfile/mind-map-viewer test
```

下载脚本读取 [public-samples.json](public-samples.json)，固定到提交内容并校验 SHA-256；已有匹配文件直接复用。未设置环境变量时，常规单元测试跳过公开样本套件，不产生网络请求。

完整执行结果见 [public-results.json](public-results.json)。下表来源链接均固定到实际下载的提交。

## 文件明细

| 来源文件 | 格式 | 字节数 | 主题数 | 结果 |
| --- | --- | ---: | ---: | --- |
| [mindmanager/Android Skill Tree.xmind](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/Android%20Skill%20Tree.xmind) | xmind-xml | 184738 | 341 | 通过 |
| [mindmanager/Android.mmap](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/Android.mmap) | mmap | 29976 | 29 | 通过 |
| [mindmanager/Android网络框架.mmap](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/Android%E7%BD%91%E7%BB%9C%E6%A1%86%E6%9E%B6.mmap) | mmap | 34004 | 52 | 通过 |
| [mindmanager/Git.mmap](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/Git.mmap) | mmap | 36558 | 128 | 通过 |
| [mindmanager/IPC.mmap](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/IPC.mmap) | mmap | 34230 | 61 | 通过 |
| [mindmanager/Java知识体系.mmap](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/Java%E7%9F%A5%E8%AF%86%E4%BD%93%E7%B3%BB.mmap) | mmap | 30107 | 34 | 通过 |
| [mindmanager/Java编程思想.mmap](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/Java%E7%BC%96%E7%A8%8B%E6%80%9D%E6%83%B3.mmap) | mmap | 34960 | 26 | 通过 |
| [mindmanager/Kotlin.mmap](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/Kotlin.mmap) | mmap | 29805 | 14 | 通过 |
| [mindmanager/Linux.mmap](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/Linux.mmap) | mmap | 89203 | 195 | 通过 |
| [mindmanager/View.mmap](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/View.mmap) | mmap | 33767 | 43 | 通过 |
| [mindmanager/android面试.mmap](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/android%E9%9D%A2%E8%AF%95.mmap) | mmap | 31050 | 21 | 通过 |
| [mindmanager/书单.mmap](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/%E4%B9%A6%E5%8D%95.mmap) | mmap | 33269 | 96 | 通过 |
| [mindmanager/优化技巧.mmap](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/%E4%BC%98%E5%8C%96%E6%8A%80%E5%B7%A7.mmap) | mmap | 34898 | 107 | 通过 |
| [mindmanager/关于产品经理.mmap](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/%E5%85%B3%E4%BA%8E%E4%BA%A7%E5%93%81%E7%BB%8F%E7%90%86.mmap) | mmap | 32086 | 36 | 通过 |
| [mindmanager/图片加载.mmap](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/%E5%9B%BE%E7%89%87%E5%8A%A0%E8%BD%BD.mmap) | mmap | 33355 | 49 | 通过 |
| [mindmanager/基础知识.mmap](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/%E5%9F%BA%E7%A1%80%E7%9F%A5%E8%AF%86.mmap) | mmap | 31025 | 15 | 通过 |
| [mindmanager/多线程.mmap](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/%E5%A4%9A%E7%BA%BF%E7%A8%8B.mmap) | mmap | 67713 | 71 | 通过 |
| [mindmanager/插件化.mmap](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/%E6%8F%92%E4%BB%B6%E5%8C%96.mmap) | mmap | 33948 | 34 | 通过 |
| [mindmanager/收藏集.mmap](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/%E6%94%B6%E8%97%8F%E9%9B%86.mmap) | mmap | 28882 | 8 | 通过 |
| [mindmanager/版本控制之道.mmap](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/%E7%89%88%E6%9C%AC%E6%8E%A7%E5%88%B6%E4%B9%8B%E9%81%93.mmap) | mmap | 32426 | 43 | 通过 |
| [mindmanager/知识体系.mmap](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/%E7%9F%A5%E8%AF%86%E4%BD%93%E7%B3%BB.mmap) | mmap | 30056 | 15 | 通过 |
| [mindmanager/英语.mmap](https://github.com/Smilestal/MindManagers/blob/25aea75f9631b04726d5b1112be1fef937d2e9c2/%E8%8B%B1%E8%AF%AD.mmap) | mmap | 26653 | 3 | 通过 |
| [xmind/tests/xmind_2026.xmind](https://github.com/tobyqin/xmindparser/blob/86cb671c49b6212ed641b8cb225d659f4ca31bde/tests/xmind_2026.xmind) | xmind-json | 288178 | 42 | 通过 |
| [xmind/tests/xmind_pro.xmind](https://github.com/tobyqin/xmindparser/blob/86cb671c49b6212ed641b8cb225d659f4ca31bde/tests/xmind_pro.xmind) | xmind-xml | 93149 | 46 | 通过 |
| [xmind/tests/xmind_zen.xmind](https://github.com/tobyqin/xmindparser/blob/86cb671c49b6212ed641b8cb225d659f4ca31bde/tests/xmind_zen.xmind) | xmind-json | 76174 | 28 | 通过 |
| [freeplane/freeplane/doc/Freeplane_LaTeX.mm](https://github.com/freeplane/freeplane/blob/73f5b6e0a02424e7c4421e1017f5f00c288af76a/freeplane/doc/Freeplane_LaTeX.mm) | mm | 30647 | 111 | 通过 |
| [freeplane/freeplane/doc/freeplaneApplications_ja.mm](https://github.com/freeplane/freeplane/blob/73f5b6e0a02424e7c4421e1017f5f00c288af76a/freeplane/doc/freeplaneApplications_ja.mm) | mm | 21993 | 41 | 通过 |
| [freeplane/freeplane/doc/freeplaneFunctions.mm](https://github.com/freeplane/freeplane/blob/73f5b6e0a02424e7c4421e1017f5f00c288af76a/freeplane/doc/freeplaneFunctions.mm) | mm | 34832 | 69 | 通过 |
| [freeplane/freeplane/doc/freeplaneUserGuide.mm](https://github.com/freeplane/freeplane/blob/73f5b6e0a02424e7c4421e1017f5f00c288af76a/freeplane/doc/freeplaneUserGuide.mm) | mm | 337957 | 1516 | 通过 |
| [freeplane/freeplane_framework/test_data/RichtextTests.mm](https://github.com/freeplane/freeplane/blob/73f5b6e0a02424e7c4421e1017f5f00c288af76a/freeplane_framework/test_data/RichtextTests.mm) | mm | 4857 | 7 | 通过 |
| [freeplane/freeplane_framework/test_data/StructuredMapTest.mm](https://github.com/freeplane/freeplane/blob/73f5b6e0a02424e7c4421e1017f5f00c288af76a/freeplane_framework/test_data/StructuredMapTest.mm) | mm | 11519 | 59 | 通过 |
| [freemind/README.mm](https://github.com/JirkaDellOro/FreeMindViewer/blob/ed783bbe8f1bbd4956be963569c0570e4f38cafe/README.mm) | mm | 1076 | 8 | 通过 |
| [freemind/Test/test.mm](https://github.com/JirkaDellOro/FreeMindViewer/blob/ed783bbe8f1bbd4956be963569c0570e4f38cafe/Test/test.mm) | mm | 1602 | — | 预期拒绝（非标准片段） |
| [freemind/Test/test2.mm](https://github.com/JirkaDellOro/FreeMindViewer/blob/ed783bbe8f1bbd4956be963569c0570e4f38cafe/Test/test2.mm) | mm | 1602 | — | 预期拒绝（非标准片段） |
| [freemind/Test/test3.mm](https://github.com/JirkaDellOro/FreeMindViewer/blob/ed783bbe8f1bbd4956be963569c0570e4f38cafe/Test/test3.mm) | mm | 1728 | — | 预期拒绝（非标准片段） |
| [mindr/inst/examples/mindr-mm.mm](https://github.com/pzhaonet/mindr/blob/92d60d4b23154506522336f11208cbcea4d4e164/inst/examples/mindr-mm.mm) | mm | 531 | 16 | 通过 |

## 修复后工程检查

- 插件测试（包含公开样本批量验证）：28/28 通过。
- 应用测试：131/131 通过。
- ESLint、TypeScript `--noEmit`、`git diff --check`：通过。
- 生产构建：通过；657 个静态页面完成生成，首包、插件分包、资产策略及 FFmpeg 隔离检查全部通过。
