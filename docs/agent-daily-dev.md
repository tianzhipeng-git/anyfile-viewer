# 工作流
- 任务来自根目录 `ROADMAP.md` 需求池，领取、拆分、完成标记规则见该文件。用户直接指定的任务优先。
- 日常开发分支是 `dev`。每个任务从最新 `dev` 拉 `agent/<YYYY-MM-DD>-<topic>` 分支，一个分支只做一件事，完成后在本地合并回 `dev`（不提 PR）并推送 `origin dev`，然后删除该任务分支。不直接提交或合并到 `main`（`main` 自动部署到 Vercel，每周由人工 review 后从 `dev` 合并）。
- 合并到 `dev` 前必须本地通过门禁；提交说明写清：做了什么、验证了什么、哪些需要人工浏览器验收（见 `docs/plugin-development.md` 第 6 节）。
- 门禁失败时修代码，不改门禁。确需放宽预算、扩大 allowlist、跳过或删除测试时，在提交说明中单独写出理由，交给每周 review 判断。

大部分情况, 不需要咨询用户的建议/对用户提问/等待用户确认, 直接根据合理方式决策即可.  如果是必须用户确认的东西, 先使用下述命令给用户发个飞书提醒, 然后再进行提问和确认.
`lark-cli im +messages-send --user-id ou_a943cca571fcd87db12f30a8289a3e6b --text "你好" --as bot --json`