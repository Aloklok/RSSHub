# RSSHub Merge 记录与维护文档

本文档用于记录从上游 (`upstream/master`) 合并的重大变更、冲突解决过程以及后续待处理的 TODO 事项。

---

## 📅 2026-06-02
### 合并信息
- **来源**: `upstream/master` (DIYgod/RSSHub)
- **上游新增提交**: 810 个
- **合并方式**: 直接采纳上游 workflow 文件，在 GitHub Actions 页面手动禁用不需要的。仅需手动解决 3 个代码冲突。

### 关键变动记录
- **浏览器自动化迁移**: 上游全面从 Puppeteer 切换到 Playwright。
- **Lint/格式化**: 上游引入 `oxlint` (`oxlintrc.json`)，新增 eslint 插件 (`no-then.js`, `nsfw-flag.js`)。

### 冲突解决
| 文件 | 决定 | 原因 |
|------|------|------|
| `Dockerfile` | 采纳上游 | 本地唯一改动（corepack 位置微调）上游已涵盖 |
| `lib/routes/infoq/utils.ts` | 保留本地 | 本地版本更完善（并发控制、图片代理、富文本解析），额外移植上游 `addCoverToDescription` 封面图功能 |
| `lib/routes/nasa/apod-cn.ts` | 保留本地 + 补回元数据 | 保留本地图片代理改进，补回被删除的路由元数据，修复上游 `apod.nasa.govundefined` bug |

---

## 📅 2026-02-21
### 合并信息
- **来源**: `upstream/master` (DIYgod/RSSHub)
- **合并方式**: 命令行合并，通过 `.gitattributes` 处理 Workflow 冲突。

### 关键变动记录 (不含路由)
- **底层架构升级**: 彻底废弃 Babel，切换到基于 `esbuild` 的 `tsdown` 构建系统。
- **内容解析器优化**: 将 `@postlight/parser` 替换为性能更强的 `@jocmp/mercury-parser`。
- **构建配置变动**: 更新了 `Dockerfile`（引入 `rebrowser-puppeteer`）及多份 `tsdown.*.config.ts`。
- **轻量化/边缘计算**: 优化了 `app.worker.tsx`，精简了 Worker 环境下的中间件加载逻辑。
- **依赖更新**: `package.json` 及 `pnpm-lock.yaml` 涉及大量底层库版本升级。

### 冲突解决
- **Workflow**: 由于本地已删除部分上游 Workflow，合并阶段通过 `git rm` 手动维持了删除状态。
- **配置优化**: 更新了 `.gitattributes` 以递归匹配 `.github/workflows/**`。

---

## 📋 待办事项 (TODO)

### 维护管理
- [x] **Workflow 管理**: 直接使用上游 workflow 文件，不需要的在 GitHub Actions 页面手动 Disable 即可。移除了 `.gitattributes` merge driver 和占位文件方案。
- [ ] **多架构支持**: 考虑在 `.github/workflows/docker-image.yml` 中开启 `linux/arm64` 构建。
- [ ] **性能指标观测**: 观测部署到 Zeabur 后，新构建系统（tsdown）和解析器（Mercury）对内存占用和响应速度的影响。
