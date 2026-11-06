# 交接给项目方

聆镜 PSYGYM 从 Novawerk 交给项目方。这一页列出每样东西现在在谁手里、交接后归谁、要做什么。打了 ☐ 的是还没做的。

密钥、密码、验证码不写在这里，也不发在消息里。交接时当面或用密码管理器的共享功能给。

## 现在能用的

| 什么 | 地址 |
|------|------|
| 官网 | https://psygym.novawerk.io |
| API | https://psygym-api.novawerk.io |
| 后台 | https://admin.psygym.novawerk.io |
| iOS | 0.4.0（Build 22），2026-11-03 提交审核，发布方式是手动：过审后要有人点「发布」 |
| Android | Play 内部测试，0.4.0（versionCode 5） |
| 代码 | GitHub `Novawerk/project-psygym-workspace`，公开，MIT |

## 你们自己在后台就能做的

不用找我们：

- **加人、停用人。** 后台「成员」，只有「管理员」看得到。加上邮箱就是邀请，对方用这个 Google 账号登录。
- **新建病例。** 「病例」→「新建病例」，从模板开始，或上传 `.md` 文件（格式见 [`content/README.md`](../content/README.md)）。
- **改、试聊、发布、回滚。** 见 [for-psygym-team.md](./for-psygym-team.md)「怎么交」。App 一分钟内用上新发布的版本。

☐ 给项目方负责人开一个「管理员」账号（机构选「聆镜」）。之后聆镜内部的人由他们自己加。

## 账号和服务

| 东西 | 现在 | 交接后 | 要做的 |
|------|------|--------|--------|
| App Store Connect | Haodong Ju 的个人账号（卖家） | 先不动 | 见下面「要定的事」1 |
| Google Play | Haodong Ju 的个人账号 | 先不动 | 同上 |
| AI 模型（Anthropic） | Vercel 里的 `ANTHROPIC_API_KEY` 是 Haodong 自己的 key | 项目方的 key | ☐ 项目方给 key，我们换上、重新部署 |
| 语音（ElevenLabs） | 已经是项目方的工作区 | 项目方 | 不用动 |
| 服务器（Vercel：`psygym-api`、`psygym-admin`、`psygym-web`） | Novawerk 的 Vercel 团队 | Novawerk 代管 | 见「要定的事」2 |
| 数据库（Neon，法兰克福） | Novawerk | 跟着服务器走 | 存后台账号、病例版本、发布记录、匿名计数。不存对话 |
| 域名 `*.psygym.novawerk.io` | Novawerk | 不变 | 以后换域名的话，App 里的 API 地址要改，要发新版 |
| 后台登录（Google OAuth 客户端） | Novawerk 的 Google Cloud | 跟着服务器走 | 换域名要改授权来源 |
| 登录邮件（Resend） | Novawerk | 跟着服务器走 | |
| 通知（Slack #project-psygym） | Novawerk 的 Slack | 待定 | 反馈和发布通知发到这里。可以换成项目方的 webhook |
| 代码仓库 | GitHub `Novawerk` 组织，公开，MIT | 留在 Novawerk，项目方随时 fork | ☐ 给项目方的人加仓库权限（如果他们要改代码） |
| 任务板 | Jira `PSY` | 留在 Novawerk | |

## 要定的事

1. **App 上架在谁的账号下。** 定了（2026-11-06）：**先不动**。Haodong 的个人开发者账号继续当卖家，项目方用后台管内容。以后要转，有两条路：
   - 转给项目方：Apple 和 Google 都支持把 App 转到另一个开发者账号，评分、用户都保留。项目方要先有自己的开发者账号（Apple 99 美元/年，Google 一次 25 美元）。审核中的版本要等过审之后再转。
   - 转给组织账号：要 D-U-N-S 编号，申请几周。审核指南 5.1.1(ix) 的风险也一起解决。
2. **服务器和数据库谁管。** 定了（2026-11-06）：**Novawerk 继续代管**，留在 Novawerk 的 Vercel 和 Neon 上，域名、后台 Google 登录、Resend 也不动。以后要转到项目方的账号：Vercel 支持转项目，数据库要导出再导入。
3. **以后谁改代码、谁部署。** 现在合并代码不会自动上线，部署是我们在命令行手动做的。如果项目方要找别的开发者，我们写一页部署说明并移交 Vercel 权限。
4. **隐私政策里的运营方。** 隐私政策写的是 Novawerk。上架账号先不动，所以现在不改。以后账号转给项目方，隐私政策、App 隐私标签和商店联系邮箱（现在是 info@novawerk.io）要一起改。

## 交接清单

☑ 第 1 件定了：上架账号先不动。
☑ 第 2 件定了：服务器和数据库由 Novawerk 继续代管。
☐ 第 3 件定下来。
☐ 项目方负责人有后台「管理员」账号，登录过一次。
☐ 换上项目方的 Anthropic key。
☐ iOS 0.4.0 过审后点发布（谁点：___）。
☐ Play 正式版之前的封闭测试：至少 12 个测试员连续 14 天，最晚 12 月初开始（见 [release/README.md](./release/README.md)）。
☐ 把这一页和 [for-psygym-team.md](./for-psygym-team.md) 发给项目方。
