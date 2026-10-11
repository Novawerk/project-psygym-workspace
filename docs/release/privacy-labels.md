# App 隐私标签和数据安全表（草稿）

依据：2026-10-10 的代码（`apps/mobile`、`apps/api`），加上已定、但还在 PR 里的两项：本机练习记录（0005）、报告评价（D7，`POST /feedback`）和举报单条 AI 内容（D8，`POST /report`，#47）。正式提交前按当时的代码再核一遍。

## 我们按代码核实过的事实

| 事实 | 依据 |
|------|------|
| App 只连我们自己的服务器（release：`https://psygym-api.novawerk.io`），只走 HTTPS | `AppConfig.kt`；release 的 `network_security_config.xml` 禁止明文 |
| `/chat`、`/supervision` 的请求体是 `{caseId, locale, messages[]}`，也就是整段对话；请求头带 `X-Invite-Code` | `KtorPsygymApi.kt`、`Models.kt` |
| 不发设备信息，也不加自定义 User-Agent | 同上 |
| 依赖里没有分析、崩溃统计、广告、登录 SDK；没有 Firebase、Crashlytics、Sentry | `libs.versions.toml`、`build.gradle.kts`；iOS 没有 Pods 和 SPM 依赖 |
| 不读广告 ID、ANDROID_ID、IDFA 或 IDFV；没有 ATT | 代码搜索 |
| Android 只申请 `INTERNET` 权限；iOS 没有任何 `NS*UsageDescription` | `AndroidManifest.xml`、`Info.plist` |
| 服务端不存对话，日志只记路由、病例、语言、条数、模型、token 数、耗时 | `apps/api/src/app.ts` |
| 发给模型服务的请求里不带用户 ID、IP 或其他元数据 | `apps/api/src/llm/*.ts` |
| `/feedback` 只收 `{caseId, locale, rating, comment≤500}`，转发到 Slack；日志只记评论长度 | `apps/api/src/feedback.ts` |
| `/report` 只收 `{caseId, locale, source, reason, comment≤500, reportedText≤2000}`：被举报的一段 AI 内容，不带会谈其余部分，多出字段返回 400；转发到 Slack；日志只记 id、枚举和长度 | [api-contract.md](../api-contract.md)、#47 |
| IP 只在没配邀请码时用作限流键，只在内存里，不写日志 | `apps/api/src/rate-limit.ts` |
| 本机只存语言、邀请码等几个设置（DataStore，未加密）；iOS 的存储目录排除在备份外 | `SettingsRepository.kt`、`MainViewController.kt` |

**和文档不一致、要跟进的：**

- main 上 App 还**没有**调用 `/feedback`，也还**没有**本机练习记录。下面的申报按功能上线以后的样子写。如果先发的 build 里没有这两项，申报可以少写，但不能多出代码里没有的东西。
- `PrivacyInfo.xcprivacy` 在 #43 里改成申报 Other User Content，和下面的 Apple 申报一致。

## 匿名统计上线后要改的地方（请发布成员核对）

我们 2026-10-11 定了：后端按天统计匿名次数，App 在 `/supervision` 里多带一个 `durationSec`（一场多长，整数秒）；只存汇总，存在 Neon（法兰克福）。见 [admin.md](../product/admin.md) 第 1、5 节。上线后，下面这些地方要改。我们给的是建议，以提交时商店的定义为准：

1. **「核实过的事实」表**：
   - 第 10 行补上 `/supervision` 的 `durationSec`。
   - 第 15 行补上「服务端把匿名汇总计数写进数据库（Neon 法兰克福），不存单场记录」。
   - 第 12 行「没有分析 SDK」仍然成立（统计在我们自己的服务器上做），但要加一句说明。
2. **Apple · App Privacy**：
   - 很可能要加 **Usage Data → Product Interaction**：不关联用户身份，不用于追踪，用途 **Analytics**。理由：会谈时长和次数离开了设备，并且被保存。
   - 原来「Usage Data 不收集」那句要改。
   - 第 36 行「Analytics 不勾」的理由要重写，因为现在有服务器端统计了。
3. **Privacy manifest（`PrivacyInfo.xcprivacy`）**：对应加一项 `NSPrivacyCollectedDataTypeProductInteraction`（Linked: false, Tracking: false, Purposes: Analytics）。
4. **Google Play · Data safety**：
   - 很可能要加 **App activity → App interactions**：收集，不共享，可选还是必需按实际（`durationSec` 是 App 自动发的，算必需），用途 **Analytics**。
   - 「临时处理」选否，因为汇总会保存。
5. **如果 D-A1 选了按邀请码统计**：数据库会存邀请码的哈希。第 43 行「邀请码：服务端不保存……不算收集」要重新判断。我们的看法是：码按批次发，不对应个人，仍不算个人身份信息。最终请按商店定义核对。
6. **错误计数算不算 Diagnostics**：我们按错误码统计出错次数（`model_unavailable`、`rate_limited` 等），不收崩溃日志、不收设备信息。Apple 的 Diagnostics 和 Google 的「App info and performance」是否要因此申报，请发布按当时商店的定义判断。我们倾向不算（只是服务端按错误码计数，不是从设备收集诊断数据），但以商店说明为准。
7. **隐私政策**（[privacy-policy.md](./privacy-policy.md)）已经加了「使用统计」一行，第三方加了 Neon。申报和政策要一致。

## Apple · App Privacy（App Store Connect → App 隐私）

Apple 的「收集」指：数据离开设备，并且我们或第三方能在超过实时处理所需的时间里接触到它。对话本身我们不留，但会转给第三方模型服务，它可能按自己的政策保留。所以我们**如实申报**。

**Do you or your third-party partners collect data from this app?** → **Yes**

| 数据类型 | 用途 | 关联到用户身份？ | 用于追踪？ |
|----------|------|------------------|------------|
| User Content → **Other User Content**（练习对话、督导报告） | App Functionality | 否 | 否 |
| User Content → **Other User Content**（报告评价和一句话 D7；举报的那一段 AI 内容和一句话 D8。上线后加） | App Functionality；Analytics 不勾（我们没有分析 SDK，只是人工读反馈）。也可以只选 Other Purposes，提交时以 Apple 当时的说明为准 | 否 | 否 |

**不申报的：**

- Contact Info、Health & Fitness、Financial、Location、Sensitive Info、Contacts、Browsing / Search History、Identifiers、Purchases、Usage Data、Diagnostics：都不收集。
  - Health & Fitness 不选：来访者是虚构的，对话不是用户本人的健康数据。我们也在 App 里要求用户不输入真实来访者信息。
  - Sensitive Info 不选，理由同上。审核员如果追问，按 [review-notes.md](./review-notes.md) 解释。
- 邀请码：服务端不保存，只用于当次请求的鉴权和内存限流，不算收集。
- 只存在设备上、从不发出的数据（练习记录、「关于你」）：不算收集，不用申报。界面语言会随每个请求发出，不在这一条里。

**Tracking：** 否。`NSPrivacyTracking = false`，没有追踪域名。

**Privacy manifest（`PrivacyInfo.xcprivacy`）对齐：**

```text
NSPrivacyTracking: false
NSPrivacyTrackingDomains: []
NSPrivacyCollectedDataTypes:
  - NSPrivacyCollectedDataTypeOtherUserContent
      Linked: false, Tracking: false
      Purposes: [NSPrivacyCollectedDataTypePurposeAppFunctionality]
NSPrivacyAccessedAPITypes:
  - NSPrivacyAccessedAPICategoryUserDefaults: [CA92.1]   # 现有，保持
  - NSPrivacyAccessedAPICategoryFileTimestamp: [C617.1]  # DataStore、练习记录读 App 容器内的文件时间
  - NSPrivacyAccessedAPICategorySystemBootTime: [35F9.1] # 会谈计时用单调时钟
```

**审核指南 5.1.2(i)：** 把个人数据发给第三方 AI 之前，要明确告诉用户并取得同意。我们第一次打开时有 O2「先说清楚」页，第 3 条说明对话会发给第三方 AI 模型服务，必须勾选才能继续。这一条满足要求，不要删。

## Google Play · Data safety

Google 的「收集」指：数据离开设备。「共享」指：转给第三方。代我们处理数据的服务商（模型服务、Vercel、Slack）不算共享。

**Does your app collect or share any of the required user data types?** → **Yes**

**Is all of the user data collected by your app encrypted in transit?** → **Yes**（只走 HTTPS）

**Do you provide a way for users to request that their data is deleted?** → 选「**No**」，并在说明里写清楚：没有账号；服务器不保存对话；本机记录用户在 App 里自己删；报告评价和举报写邮件到 info@novawerk.io 删除。或者选「Yes」，然后填一个删除说明页的链接（可以是隐私政策里的「你的权利」一节）。建议选 Yes 加链接，审核更顺。

| 数据类别 → 类型 | 收集 / 共享 | 临时处理？ | 必需还是可选 | 用途 |
|-----------------|-------------|------------|--------------|------|
| App activity → **Other user-generated content**（练习对话、督导报告） | 收集；不共享 | **是**（我们的服务器只在内存里处理，不保存） | 必需（不发对话就没法练） | App functionality |
| App activity → **Other user-generated content**（报告评价和一句话 D7；举报的那一段和一句话 D8。上线后加） | 收集；不共享 | 否（留在 Slack） | 可选 | App functionality（或 Analytics：Google 把「改进 App」算在 Analytics 下。提交时按当时 Google 的定义选） |

不申报：Location、Personal info、Financial info、Health and fitness、Messages（这里指邮件、短信、App 内私信，不是我们的场景）、Photos and videos、Audio、Files and docs、Calendar、Contacts、Web browsing、App info and performance、Device or other IDs。

**注意：** 对话是否「临时处理」只看我们自己的服务器。如果生产环境的模型服务会保留对话，Google 可能把它算作不是临时处理。以模型服务实际的 API 条款为准，提交前确认。

## 每次改代码后检查

下面任何一条变了，就回来改这份文档和 [privacy-policy.md](./privacy-policy.md)：

- 新增 SDK（尤其是 Firebase、崩溃统计、分析）
- 新增接口，或者请求里多了字段
- 换模型服务商
- 本机存储加密，或者练习记录开始上云
- 增加账号、推送通知、邮箱收集
