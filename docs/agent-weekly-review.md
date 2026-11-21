# 每周 review：dev → main

每周一次，把 `dev` 合并到 `main`（自动部署 Vercel）。目标是发现日常门禁抓不到的问题：门禁被放宽、架构腐化、需要真实浏览器验收的改动。

## 1. 准备

```bash
git fetch origin
git checkout dev && git pull
pnpm install --frozen-lockfile && pnpm check && pnpm build
git log --oneline origin/main..dev          # 本周提交
git diff --stat origin/main...dev | tail -1  # 改动规模
```

`dev` 的 CI 最近一次必须是绿的；不是绿的先修，不合并。

## 2. 门禁是否被放宽（逐项看 diff）

```bash
R=origin/main...dev
git diff $R -- scripts/check-repo.mjs scripts/check-*.mjs vitest.config.mts eslint.config.mjs tsconfig.json .github/
git diff $R -- viewer/plugin-policies.json          # 预算是否被调高
git diff $R --diff-filter=D --name-only -- '*.test.ts'  # 删除的测试
git diff $R | grep -nE '^\+.*\b(it|describe|test)\.(skip|only|todo)\b|eslint-disable|@ts-(ignore|expect-error)|as any'
```

allowlist 只能变短；预算调高、测试删除或跳过，必须在对应提交说明里有理由且理由成立，否则回退。

## 3. 依赖与许可证

```bash
git diff $R -- package.json 'viewer/**/package.json' pnpm-lock.yaml | grep -E '^[+-]\s+"' 
git diff $R --stat -- third_party/ tools/ THIRD_PARTY_NOTICES.md licenses/
```

- 新依赖锁定精确版本、确实必要，许可证与项目兼容（GPL 类需按 cad-dwg 的方式分发源码）。
- `third_party/` 变化必须有对应的 `tools/` 配方变化，不能是手改产物。
- 看 `.next/diagnostics/viewer-bundle-report.json`：首包和各插件体积有无异常增长。

## 4. 架构与代码review

- 新插件：README、`examples/` 真实样例与来源说明、测试是否像 `docs/plugin-development.md` 要求的那样断言具体内容，而不只是“没有抛错”。
- 重复：新代码是否复制了其他插件的大段逻辑（应抽到 `viewer/*` 共享包）。
- 共享包改动是否覆盖了所有调用方。
- 接近 1000 行的文件：`git ls-files 'src/*' 'viewer/*' | xargs wc -l | sort -rn | head`，提前安排拆分。

## 5. 文档

- 是否出现日期化验证流水、实施过程记录、`docs/<plugin>.md` 之类本应写进插件 README 的文件。
- 支持矩阵和站点格式页的等级是否与实际能力一致。
- `AGENTS.md` 和本目录规范是否需要因本周暴露的问题而更新——反复出现的问题应变成规则或门禁。
- 处理需求池文件- `ROADMAP.md`：本周完成了哪些、新增了哪些。
    - 已完成条目确实达到描述的范围；`[!]` 受阻条目决定重新拆分、降级或删除。
    - 调研 Agent 新增条目的证据是否可信、难度是否合理；调整优先级顺序。
    - 本次合并到 main 后，删除已发布的 `[x]` 条目。

## 5. 架构升级契机
及时的甄别和发现, 现有的架构设计、抽象和契约是否已经过时、落后, 阻碍到项目继续扩展, 提出架构升级方案供用户选择. 
这是我们每周review工作的重点.

## 6. 真实浏览器验收
从本周提交说明里收集“需人工浏览器验收”的条目：

用 `pnpm build && pnpm start` 在 Chrome 打开 `/en/view` 和 `/zh-CN/view`，用插件 `examples/` 中的样例逐项检查：打开、缩放/翻页/播放、窄窗口、切换文件、损坏文件的错误状态、DevTools 网络面板中没有上传文件内容。未通过的条目修复或回退后再合并。

如果可以自行用浏览器验收的直接验收, 无法验收的留待用户人工确认.

## 7. 用户协商
与用户协商确认上述过程中产生的待确认问题和阻塞点.

在提出待确认问题前, 使用如下命令通知用户: 
`lark-cli im +messages-send --user-id ou_a943cca571fcd87db12f30a8289a3e6b --text "你好" --as bot --json`

## 8. 合并与上线

1. 在 GitHub 从 `dev` 向 `main` 提 PR，描述中附本周摘要和第 2–7 节结论，等待 `check`、`build` 通过后合并。
2. Vercel 部署完成后，在线上打开几个本周涉及的格式页和查看页做冒烟；运行时资产从 R2/jsDelivr 加载的插件确认能初始化。
3. 线上出问题时，在 GitHub 上 revert 合并提交恢复 `main`，修复在 `dev` 上进行。
