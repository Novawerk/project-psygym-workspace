# 改代码和部署

给接手聆镜 PSYGYM 的开发者。服务器还在 Novawerk 的 Vercel 团队（`novawerk`）上，由 Novawerk 代管；App Store 和 Google Play 还在 Haodong Ju 的个人开发者账号上（见 [handoff.md](./handoff.md)）。

## 代码在哪

| 目录 | 是什么 | 怎么本地跑 |
|------|--------|-----------|
| `apps/api` | 后端（Hono），AI 来访者、AI 督导、登录、后台接口 | [apps/api/README.md](../apps/api/README.md) |
| `apps/admin` | 后台（React + Vite） | [apps/admin/README.md](../apps/admin/README.md) |
| `apps/web` | 官网（Astro，静态） | [apps/web/README.md](../apps/web/README.md) |
| `apps/mobile` | App（Kotlin Multiplatform，iOS + Android） | [apps/mobile/README.md](../apps/mobile/README.md) |
| `content/` | 病例和督导标准的留底副本。线上内容在后台改，不在这里 | [content/README.md](../content/README.md) |

Node 22+、pnpm 10。根目录 `pnpm install` 一次。决定和理由在 [decisions/](./decisions/)，接口合同在 [api-contract.md](./api-contract.md) 和 [admin-api.md](./admin-api.md)。

## 改代码

1. 从 `main` 开分支，提 PR 到 `main`。
2. 合并前本地跑过：`pnpm --filter api test`、`pnpm --filter admin build`、`pnpm --filter web test`，改了 App 就跑 App 的测试。
3. 合并到 `main` **不会自动上线**。上线见下面。

## 部署服务器

三个 Vercel 项目，都在 `novawerk` 团队，区域 fra1：

| 项目 | 地址 | Vercel 的 Root Directory |
|------|------|--------------------------|
| `psygym-api` | psygym-api.novawerk.io | `apps/api` |
| `psygym-admin` | admin.psygym.novawerk.io | `apps/admin` |
| `psygym-web` | psygym.novawerk.io | `apps/web` |

要有 `novawerk` 团队的 Vercel 权限，并装好 Vercel CLI。从仓库**根目录**、最新的 `main` 部署（Root Directory 在 Vercel 那边设好了）：

```bash
git switch main && git pull
vercel link --yes --project psygym-api --scope novawerk
vercel deploy --prod --yes --scope novawerk
```

换成 `psygym-admin` 或 `psygym-web` 再来一遍。只部署改过的项目。

顺序：

1. **有新的数据库迁移**（`apps/api/drizzle/` 里多了文件）：先迁移，再部署 API。迁移从不在部署时自动跑，见 [apps/api/README.md](../apps/api/README.md)「Going live (once)」第 2 步。
2. **API 加了新接口、后台要用**：先部署 API，再部署后台。
3. 部署完看一眼：`curl -s https://psygym-api.novawerk.io/health`，打开后台登录一次。

回滚：Vercel 网页上 → 项目 → Deployments → 选上一个 → Promote to Production。

## 环境变量

都在 Vercel 的项目设置里，名字和意思见 [apps/api/README.md](../apps/api/README.md)「Environment」和 `apps/api/.env.example`。值不进 git，不发在消息里。改了变量要重新部署才生效。

模型和 Claude key 也可以在后台「模型设置」里改（[ADR 0015](./decisions/0015-model-settings.md)）：后台填的盖过环境变量，没填的照旧用环境变量。这要服务器上有 `MODEL_SETTINGS_SECRET`。这个值换了，后台存的 key 就解不开了，要在后台重新填一次。

## 发 App

App Store 和 Google Play 在 Haodong Ju 的个人账号上，所以发新版要经过他：

- **iOS：** Xcode Cloud 从仓库打包上传，提交审核和过审后点发布由账号持有人做。
- **Android：** 上传密钥在 Haodong 的电脑上（[release/signing.md](./release/signing.md)）。打好的 AAB 由他上传。

版本号、商店文案、隐私标签和审核说明见 [release/](./release/)。改了数据流（新接口、新 SDK、新存储），要同步改 [release/privacy-labels.md](./release/privacy-labels.md) 和 [release/privacy-policy.md](./release/privacy-policy.md)。

## 规矩

- 只用模拟对话，不存真实来访者的数据。服务器不存对话，日志里不写对话、邮箱、验证码。
- 临床内容（病例、督导标准、提示词里的临床规则）由聆镜的心理学同事定，开发者不改。
- 密钥、证书、密码不进 git。仓库是公开的。
