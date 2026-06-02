# RSSHub 项目维护规则

## 🛠 合并与版本维护
- **MERGE 记录**: 每次从 `upstream` 合并后，必须在根目录的 `MERGE.md` 中记录重大变动（不含路由变动）和冲突解决过程。
- **Workflow 保护**: 
    - 项目通过 `.gitattributes` 配置了 `.github/workflows/** merge=ours` 以保护本地 Workflow。
    - 确保本地环境已执行 `git config merge.ours.driver true`。
    - 合并上游时，若产生 `modify/delete` 冲突，应优先维持本地的“精简/删除”状态。
    - 上游新增的 Workflow 文件若非必要，应通过 `git rm` 及时清理以保持仓库纯净。

## 🚀 部署与架构 (Zeabur)
- **环境**: 部署于 Zeabur，目前主要运行环境为 AMD64。
- **TODO - ARM 支持**: 后续可考虑开启 `linux/arm64` 构建，以利用上游针对 `rebrowser-puppeteer` 的性能优化，提高部分反爬路由的稳定性。

## 📁 目录约定
- **MERGE.md**: 维护日志与后续待办事项。
- **docker-image.yml**: 用于构建发布至 Docker Hub 的自定义镜像。
