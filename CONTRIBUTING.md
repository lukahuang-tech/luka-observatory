# 协作维护

本仓库用于用户和获得授权的 AI 共同维护「观测」平台。仓库默认私有；在其他 AI 工具中连接 GitHub 并只授权此仓库，即可共同修改。仓库链接本身不会授予私有仓库读取权限。

## 每次修改

1. 先阅读 `AGENTS.md`、`README.md`、`docs/ai-handoff.md` 和 `docs/maintenance.md`，检查 git 状态，保留已有改动。
2. 从最新 `main` 建立任务分支，例如 `feature/new-indicator` 或 `fix/chart-axis`。多个 AI 使用各自分支或 checkout，避免同时编辑同一个工作目录。
3. 只完成当前任务需要的修改。新增指标按目录与适配器扩展；两个业务模块的数据存储必须独立。
4. 运行检查，在 Pull Request 中说明行为变化、验证结果和未解决限制。
5. 由用户或其明确授权的维护者审阅并合并。不要擅自扩大网站或仓库的共享范围，也不要强制推送覆盖其他人的提交。

## 运行与检查

使用 `.nvmrc` 对应的 Node.js 22（至少 22.13），安装命令为 `npm ci`。本地首次运行、数据库初始化和开发登录见 README。干净 checkout 默认使用 portable 模式，无需安装 Codex 或读取作者的本机目录。

```sh
npm test
npm run typecheck
npm run build
```

GitHub Actions 在 `main` 提交和 Pull Request 上运行这些检查。CI 不需要模型密钥，也不会发布网站。

修改持久化或 API 时，先启动本地开发服务，再运行 `node scripts/test-api.mjs` 和/或 `node scripts/test-smart-money-api.mjs`。这些脚本仅允许本地目标；禁止改成生产地址。修改图表、导航或交互时，需要实际操作验证；构建成功不等于点击行为正确。

## 数据与秘密

仓库保存应用代码、目录、初始历史数据、测试样本和数据库迁移。线上 D1/R2 中后续导入的数据、账户设置、运行记录、模型密钥不会随 Git 自动同步。操作生产数据前通过平台导出备份，并按维护文档保护原始文件与历史快照。

`.env.example` 只包含开发身份和空凭据。不要提交 `.env`、`.dev.vars`、访问令牌、Cookie、数据库文件或个人导出。`.openai/hosting.json` 的项目编号不是凭据；它用于维护已有站点，不应替换成新项目。

## 代码与网站发布

GitHub 的 `main` 是协作代码入口。现有网站仍由 Sites 托管，GitHub Actions 只执行验证。合并代码后，获授权发布者需把该提交同步至既有 Sites 项目、构建并发布，再检查部署结果和真实访问。

当前本机 checkout 的 `origin` 指向 Sites 源码仓库；GitHub 使用独立的 `github` remote。其他人从 GitHub clone 后，`origin` 通常指向 GitHub，这是正常的。执行 push 前先确认目标 remote 和分支。向 GitHub push 不会自动更新线上网站。

没有 Sites 权限的 AI 可以完成本地代码、测试和 Pull Request，并把准确的提交编号交给用户发布。不要使用用户浏览器 Cookie、降低认证检查或把私有站点改成公开来解决权限问题。
