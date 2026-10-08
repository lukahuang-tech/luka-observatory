# 观测 · 个人量化研究

[GitHub 私有仓库](https://github.com/lukahuang-tech/luka-observatory)

个人持有源码与数据、可扩展的研究工作台。包含58个指标：利率、通胀、M2、官方黄金数量、美联储资产负债表和TIC地区美债持仓，覆盖美国、日本、欧元区、英国、法国、德国和中国；历史与补充口径独立保存。

其他 AI 接手请先读 [协作流程](CONTRIBUTING.md) 和 [平台说明](docs/ai-handoff.md)。在 AI 工具中授权此私有仓库，或 clone 到其开发目录，即可共同修改。每项任务使用独立分支和 Pull Request；GitHub Actions 检查数据逻辑、类型和构建。线上导入数据和密钥需单独备份；提交代码不会自动部署网站。

网站共用登录与一级导航，分为 **数据观察**（`/`，宏观指标）、**金融机构13F持仓披露**（`/smart-money`，SEC 13F 机构持仓）与 **石油产业链**（`/oil-industry`，完整阅读版）。聪明钱迁入原工作台20家机构、79个机构季度、24,781条已存持仓；文件生成于2026-08-26，2026Q2同季覆盖17家。原始本地程序保留。前两个分类分别持久化和备份，互不覆盖；产业链阅读页为静态研究资料，不写入用户数据库。

石油产业链包含60家上市公司、28条原料路线与88项商品部件应用，研究日期为2026-10-07至2026-10-08。完整正文及来源保存在 `docs/oil-industry-reading.md`；修改后运行 `node scripts/prepare-oil-reading.mjs` 更新结构化阅读数据，`--check` 可检查同步和内容数量。正文在登录验证后服务端渲染，支持章节、产业环节和应用领域跳转；公司代码不是实时行情。

聪明钱支持季度切换、机构详情与趋势、前十大、专业持仓表、清仓、同期共同持仓、增减仓观察、标的反查、HTML/JSON更新预览、完整备份和研究包。导入较新的有效记录并保留历史；旧文件和失败季度不覆盖当前有效记录。仅提取原HTML中的JSON，不执行上传脚本。当前13F依旧通过原本地更新器产生文件后上传，**未启用直接SEC定时采集**。

AI使用共用模型设置；无密钥时可下载两个分类各自的研究包，或使用各自的只读WebMCP。13F原数据存在期权混合、前500笔截断、单位判断与修订覆盖限制，页面标示范围；同期聚合排除旧季度与期权，异常/缺失基期不产生方向结论。详见 `docs/smart-money.md`。

## 使用

- **观察空间**：主题独立，指标由目录驱动。新建空间后可添加CSV，也可以将Excel/PDF/网页源文件交给Codex实现新适配器。
- **图表**：跨空间自由组合并保存；逐指标选择原值、余额起点100或同比，百分比指标使用原值/同比百分点差。两种单位使用左右轴，更多单位分图。点击图例/指标卡查看口径与来源。
- **相关性**：Pearson，严格同月/同年配对；月度序列的年度统计要求12个有效月。水平相关不能解释因果。
- **导入**：映射日期列/数值列、声明单位与频率，预览后提交；重复文件与相同映射幂等。先创建个人序列，不覆盖官方指标。源文件保存在R2，可从指标详情下载。
- **备份**：设置里下载全部当前数据、指标、空间、来源、断点。恢复时明确确认，旧快照继续保留。原始上传文件单独下载；模型凭证与账户设置不在数据备份中。
- **智能体**：手动调用服务端模型，或下载研究JSON、复制说明、通过合法Codex deep link预填新任务；网站不能自动附加文件或自动发送新任务。

## 当前真实状态

网站默认私人访问。OWNER_EMAIL由托管端配置，只读访客不能写数据或发起付费调用。邀请成员通过Sites访问控制，由用户明确提供邮箱后操作。

已实现31个直接刷新适配器，包括新增黄金5个、美联储3个、TIC地区3个、ECB当前欧元区利率/通胀2个。平台打开时可每天检查一次，也可手动检查；失败保留上一份有效数据并记录原因。当地预览环境的部分外部请求超时，不能据此声称生产网络已验证。中国M2/收益率、日本M2/收益率/CPI、法国M2/最新CPI等仍按源文件更新，目录逐项显示。

**后台定时更新尚未启用**。当前Sites工具没有可调用的云调度创建接口，前端计时器不等于无人值守任务。后续接入宿主调度或独立安全任务执行器时，复用`lib/refresh.ts`与快照服务；见`docs/maintenance.md`。

**尚无模型密钥，未执行真实模型调用**。OpenAI通过OpenAI Developers的`openai-platform-api-key`流程取得授权并配置服务端`OPENAI_API_KEY`；兼容接口使用服务端`AI_API_KEY`。前端仅填写协议、受控地址和模型名称，不能读取密钥。新增供应商以独立服务端适配器实现。

## 本地运行

Node >=22.13，npm，Cloudflare Worker兼容运行时。

```sh
npm ci
cp .env.example .env
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_striped_maverick.sql
npm run dev
```

本地预览使用`seedy@sites.test`模拟身份；生产不会启用模拟身份。生产OWNER_EMAIL只在Sites秘密配置中设置，不可把本地身份带入生产。

```sh
node scripts/test-core.mjs
node scripts/test-api.mjs # 仅对本地dev运行；建立临时数据并恢复原快照
node scripts/test-smart-money-api.mjs # 仅本地；验证独立存储、并发、历史保留，数据内容不变
npx tsc --noEmit
```

## 项目结构

- `app/dashboard.tsx`：工作台、空间导航、图表、来源目录。
- `components/workspace-switch.tsx`：三个一级观察分类的共享导航。
- `app/oil-industry/`、`data/oil-industry-reading.json`：产业链阅读界面与完整结构化正文。
- `app/smart-money/`、`lib/smart-money*.ts`：聪明钱界面、校验、季度比较、独立快照。
- `app/panels.tsx`：导入、AI交接、设置。
- `lib/model.ts`：指标类型、日历对齐、数据变换。
- `lib/research.ts`：研究上下文和统计；供模型、导出和WebMCP共用。
- `lib/imports.ts`：CSV和备份校验。
- `lib/refresh.ts`：声明式来源清单、采集解析、受控衍生计算。
- `lib/storage.ts`：R2不可变快照与D1原子版本指针。
- `app/api/`：认证、导入、备份、刷新、设置、模型等服务端边界。
- `data/seed.json`：经核查的初始数据；不是每次部署覆写用户库的迁移。
- `db/schema.ts`、`drizzle/`：数据库定义和不可变迁移。
- `tests/`：缺口、数值口径、导入、备份与来源样本回归。

## 迁移与长期所有权

源码、锁文件、初始数据、数据库迁移与维护说明可打包迁走。托管账户、资源与密钥另行迁移。数据备份的`schema_version`需显式升级，旧数据不能凭名称猜测新口径。任何网站的持续可用仍取决于宿主、数据来源和维护；这套结构用于降低替换它们的成本。
