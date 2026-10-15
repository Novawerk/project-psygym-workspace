# apps/admin — 聆镜 PSYGYM 后台

admin.psygym.novawerk.io。只给 Novawerk 和聆镜的人用：看匿名指标，编辑、发布病例和督导标准。方案见
[docs/product/admin.md](../../docs/product/admin.md)。

结构照 Novawerk 的后台（[Novawerk/novawerk-workspace](https://github.com/Novawerk/novawerk-workspace) 的
`apps/admin`），在这里重新写：

- React 19 单页应用，Vite 构建。
- TanStack Router（按文件生成路由，`src/routes/`）+ TanStack Query。`src/routeTree.gen.ts` 是生成的，提交进仓库，别手改。
- shadcn base-vega，zinc 配色（`src/styles.css`）。组件在 `src/components/ui/`，用 `pnpm exec shadcn add <名字>` 加。
- 数据：`src/lib/data-source.ts` 一个接口两套实现：真接口和示例数据。页面只通过 `src/lib/queries.ts` 取数。

## 现在的状态

第一期的页面都做了，照 [admin-phase1.md](../../docs/product/admin-phase1.md) 和设计稿第 ⑩ 行：登录、数据看板、
病例和督导标准（列表、新建、编辑、校验、预览、试聊、发布、放弃草稿、版本历史和差异、恢复）、发布记录。
接口照 [docs/admin-api.md](../../docs/admin-api.md)。

apps/api 的后台接口上线前，默认用示例数据：`src/lib/sample-store.ts` 是一个在内存里、照合同行为的假接口
（草稿修订号、409、422、草稿落后、回滚都会发生），刷新页面就回到初始状态。

## 本地跑

```bash
pnpm install
pnpm --filter admin dev     # http://localhost:5180
```

默认是示例数据，不用登录。侧栏底部能切换角色（管理员 / 编辑 / 只读），看各自能看到什么。
连本地接口：复制 `.env.example` 成 `.env.local`，设 `VITE_USE_SAMPLE_DATA=false`。`/api/*` 由 Vite
代理到 `localhost:8790`：apps/api 用 `PORT=8790 pnpm --filter api dev` 起，`apps/api/.env` 里设
`ADMIN_MODE=on`、`ADMIN_ORIGIN=http://localhost:5180`。不用 8787，那是本机 Novawerk 主仓库的 dev server。

## 部署

单独的 Vercel 项目（fra1），地址 admin.psygym.novawerk.io。

| 设置 | 值 |
|------|----|
| Root Directory | `apps/admin` |
| Framework | Other（`vercel.json` 已写构建命令） |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command | `pnpm build` |
| Output Directory | `dist` |
| 环境变量 | `VITE_GOOGLE_CLIENT_ID`、`VITE_USE_SAMPLE_DATA`（都是公开值，会打进前端包） |

`vercel.json` 把 `/api/*` 转到 `psygym-api.novawerk.io`（会话 cookie 同源），其余路径回到 `index.html`
（单页应用），响应头带 `noindex`。
