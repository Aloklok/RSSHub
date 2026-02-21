# RSSHub Merge 记录与维护文档

本文档用于记录从上游 (`upstream/master`) 合并的重大变更、冲突解决过程以及后续待处理的 TODO 事项。

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

### 架构与部署
- [ ] **多架构支持**: 考虑在 `.github/workflows/docker-image.yml` 中开启 `linux/arm64` 构建，以利用上游对 ARM 的 Puppeteer 优化（虽然目前 Zeabur 可能主要使用 AMD64）。
- [ ] **性能指标观测**: 观测部署到 Zeabur 后，新构建系统（tsdown）和解析器（Mercury）对内存占用和响应速度的影响。

### 维护管理
- [ ] **自动化清理**: 考虑编写脚本或 Alias，在合并后自动执行 `git checkout HEAD -- .github/workflows` 以清理上游新增的 Workflow。
