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

骨架。页面和导航都在，数据是示例数据。接口合同（后端出）到了以后，换掉 `src/lib/types.ts` 和
`data-source.ts` 里的 `apiSource`。

## 本地跑

```bash
pnpm install
pnpm --filter admin dev     # http://localhost:5180
```

默认是示例数据，不用登录。右上角菜单可以切换角色（管理员 / 编辑 / 只读），看各自能看到什么。
要连本地接口：复制 `.env.example` 成 `.env.local`，设 `VITE_USE_SAMPLE_DATA=false`。

## 部署

单独的 Vercel 项目（fra1），地址 admin.psygym.novawerk.io。

| 设置 | 值 |
|------|----|
| Root Directory | `apps/admin` |
| Framework | Other（`vercel.json` 已写构建命令） |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command | `pnpm build` |
| Output Directory | `dist` |
| 环境变量 | `VITE_API_URL`、`VITE_GOOGLE_CLIENT_ID`、`VITE_USE_SAMPLE_DATA`（都是公开值，会打进前端包） |

所有路径都回到 `index.html`（单页应用），响应头带 `noindex`。
