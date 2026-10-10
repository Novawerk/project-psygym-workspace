# App 隐私标签和数据安全表（草稿）

依据：2026-10-10 的代码（`apps/mobile`、`apps/api`），加上已定、但还在 PR 里的两项：本机练习记录（0005）和报告评价（D7，`POST /feedback`）。正式提交前按当时的代码再核一遍。

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
| IP 只在没配邀请码时用作限流键，只在内存里，不写日志 | `apps/api/src/rate-limit.ts` |
| 本机只存语言、邀请码等几个设置（DataStore，未加密）；iOS 的存储目录排除在备份外 | `SettingsRepository.kt`、`MainViewController.kt` |

**和文档不一致、要跟进的：**

- main 上 App 还**没有**调用 `/feedback`，也还**没有**本机练习记录。下面的申报按功能上线以后的样子写。如果先发的 build 里没有这两项，申报可以少写，但不能多出代码里没有的东西。
- `PrivacyInfo.xcprivacy` 的 `NSPrivacyCollectedDataTypes` 现在是空数组，要和下面的 Apple 申报对齐。已经告诉移动端。

## Apple · App Privacy（App Store Connect → App 隐私）

Apple 的「收集」指：数据离开设备，并且我们或第三方能在超过实时处理所需的时间里接触到它。对话本身我们不留，但会转给第三方模型服务，它可能按自己的政策保留。所以我们**如实申报**。

**Do you or your third-party partners collect data from this app?** → **Yes**

| 数据类型 | 用途 | 关联到用户身份？ | 用于追踪？ |
|----------|------|------------------|------------|
| User Content → **Other User Content**（练习对话、督导报告） | App Functionality | 否 | 否 |
| User Content → **Other User Content**（报告评价和一句话，D7 上线后加） | App Functionality；Analytics 不勾（我们没有分析 SDK，只是人工读反馈）。也可以只选 Other Purposes，提交时以 Apple 当时的说明为准 | 否 | 否 |

**不申报的：**

- Contact Info、Health & Fitness、Financial、Location、Sensitive Info、Contacts、Browsing / Search History、Identifiers、Purchases、Usage Data、Diagnostics：都不收集。
  - Health & Fitness 不选：来访者是虚构的，对话不是用户本人的健康数据。我们也在 App 里要求用户不输入真实来访者信息。
  - Sensitive Info 不选，理由同上。审核员如果追问，按 [review-notes.md](./review-notes.md) 解释。
- 邀请码：服务端不保存，只用于当次请求的鉴权和内存限流，不算收集。
- 只存在设备上、从不发出的数据（练习记录、语言、「关于你」）：不算收集，不用申报。

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
```

**审核指南 5.1.2(i)：** 把个人数据发给第三方 AI 之前，要明确告诉用户并取得同意。我们第一次打开时有 O2「先说清楚」页，第 3 条说明对话会发给第三方 AI 模型服务，必须勾选才能继续。这一条满足要求，不要删。

## Google Play · Data safety

Google 的「收集」指：数据离开设备。「共享」指：转给第三方。代我们处理数据的服务商（模型服务、Vercel、Slack）不算共享。

**Does your app collect or share any of the required user data types?** → **Yes**

**Is all of the user data collected by your app encrypted in transit?** → **Yes**（只走 HTTPS）

**Do you provide a way for users to request that their data is deleted?** → 选「**No**」，并在说明里写清楚：没有账号；服务器不保存对话；本机记录用户在 App 里自己删；报告评价写邮件到 info@novawerk.io 删除。或者选「Yes」，然后填一个删除说明页的链接（可以是隐私政策里的「你的权利」一节）。建议选 Yes 加链接，审核更顺。

| 数据类别 → 类型 | 收集 / 共享 | 临时处理？ | 必需还是可选 | 用途 |
|-----------------|-------------|------------|--------------|------|
| App activity → **Other user-generated content**（练习对话、督导报告） | 收集；不共享 | **是**（我们的服务器只在内存里处理，不保存） | 必需（不发对话就没法练） | App functionality |
| App activity → **Other user-generated content**（报告评价和一句话，D7 上线后加） | 收集；不共享 | 否（留在 Slack） | 可选 | App functionality（或 Analytics：Google 把「改进 App」算在 Analytics 下。提交时按当时 Google 的定义选） |

不申报：Location、Personal info、Financial info、Health and fitness、Messages（这里指邮件、短信、App 内私信，不是我们的场景）、Photos and videos、Audio、Files and docs、Calendar、Contacts、Web browsing、App info and performance、Device or other IDs。

**注意：** 对话是否「临时处理」只看我们自己的服务器。如果生产环境的模型服务会保留对话，Google 可能把它算作不是临时处理。以模型服务实际的 API 条款为准，提交前确认。

## 每次改代码后检查

下面任何一条变了，就回来改这份文档和 [privacy-policy.md](./privacy-policy.md)：

- 新增 SDK（尤其是 Firebase、崩溃统计、分析）
- 新增接口，或者请求里多了字段
- 换模型服务商
- 本机存储加密，或者练习记录开始上云
- 增加账号、推送通知、邮箱收集
