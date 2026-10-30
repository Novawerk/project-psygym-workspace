# App 隐私标签和数据安全表

这份文档分两版：

- **登录版**：本文的主体。带邮件验证码登录的新版提交审核时，两边都按这一版填。依据是 [login.md](../product/login.md) 第 6 节、[ADR 0008](../decisions/0008-sign-in.md) 和匿名统计（#62）。
- **登录前版**：2026-10-11 已经保存在 Play Console 里的那份，记录在文末。还没有送审。

我们给的是建议。提交时以商店当时的定义为准，也要按当时的代码再核一遍。

## 什么时候切到登录版

| 商店 | 现在 | 什么时候切 |
|------|------|------------|
| **Apple**（ASC → App 隐私） | 还没填。TestFlight 不需要隐私标签 | 第一次提交 App Store 审核时，直接按登录版填。那时的 build 要带登录 |
| **Google**（Play Console → Data safety） | 已经保存了登录前版，**没有送审** | 带登录的新版送审之前，把数据安全表改成登录版，再和新版一起「发送以供审核」。在那之前不送审，免得审了旧版又要改 |
| **Privacy manifest**（`PrivacyInfo.xcprivacy`） | 移动端已经按登录版填在登录 PR 里 | 跟登录 PR 一起合并 |

网页删除入口 `https://psygym.novawerk.io/delete-account` 要在 Google 送审之前上线。网站正在做。

## 我们按代码核实过的事实

| 事实 | 依据 |
|------|------|
| App 只连我们自己的服务器（release：`https://psygym-api.novawerk.io`），只走 HTTPS | `AppConfig.kt`；release 的 `network_security_config.xml` 禁止明文 |
| `/chat`、`/supervision` 的请求体是整段对话；`/supervision` 还带 `durationSec`（一场多长，整数秒） | `KtorPsygymApi.kt`、`Models.kt`、#62 |
| 不发设备信息，也不加自定义 User-Agent | 同上 |
| 没有分析、崩溃统计、广告或第三方登录 SDK；没有 Firebase、Crashlytics、Sentry。统计在我们自己的服务器上做 | `libs.versions.toml`、`build.gradle.kts`；iOS 没有 Pods，SPM 只有 ElevenLabs Swift SDK（带 LiveKit）。**发版前要核对这个 SDK 自带的 privacy manifest 合并进来的声明** |
| 不读广告 ID、ANDROID_ID、IDFA 或 IDFV；没有 ATT。合并后的 release manifest 里没有 `AD_ID` 权限 | 代码搜索；`processReleaseMainManifest` |
| Android 申请 `INTERNET`、`RECORD_AUDIO`（按住说话，第一次按住时才弹）和 `ACCESS_NETWORK_STATE`（只用来判断是不是移动网络，不弹框）；iOS 有 `NSMicrophoneUsageDescription` 和 `NSSpeechRecognitionUsageDescription` 两条说明。麦克风的声音只在手机上转成文字，不上传、不存盘；识别出的文字和打字一样，发送后才进对话（ADR 0010）。安卓的语音模型从我们的 Vercel Blob 下载一次，请求不带账号 | `AndroidManifest.xml`、`Info.plist`、`SherpaVoiceInput.kt`、`SpeechBridge.swift` |
| **语音会谈（默认关，服务器配了 ElevenLabs 才显示）**：用 `io.elevenlabs:elevenlabs-android`、ElevenLabs Swift SDK（内含 LiveKit、WebRTC）。声音经 `wss://livekit.rtc.elevenlabs.io` 和 WebRTC 实时发给 ElevenLabs，不经过我们的服务器。App 不放 ElevenLabs 的 key，只从 `POST /voice/session` 拿一次性令牌。开始前有单独的同意。Android 合并后的 manifest 多了 `MODIFY_AUDIO_SETTINGS`、`ACCESS_WIFI_STATE`、`CHANGE_WIFI_STATE`（来自 SDK） | `apps/mobile/.../ElevenLabsVoiceCall.kt`、`VoiceCallBridge.swift`、[ADR 0013](../decisions/0013-voice-elevenlabs.md) |
| 服务端不存对话，日志只记路由、病例、语言、条数、模型、token 数、耗时 | `apps/api/src/app.ts` |
| 服务端按天存汇总计数（Neon 法兰克福），不存单场记录 | #62、[admin.md](../product/admin.md) |
| 登录用邮件验证码。服务器存邮箱、注册时间、邀请码批次和登录会话；验证码邮件由 Resend 发送 | [login.md](../product/login.md)、ADR 0008 |
| 活跃人数用从账号算出的、每天和每周轮换的假名统计，明细第二天或周末汇总后删掉 | login.md 第 6 节、`docs/safety.md` §1 |
| App 内可以删除账号；删除后服务器上的账号信息马上删掉 | login.md |
| `/feedback`、`/report` 只收评价、一句话和被举报的那一段，转发到 Slack | `apps/api/src/feedback.ts`、#47 |
| 发给模型服务的请求里不带用户 ID、IP 或其他元数据 | `apps/api/src/llm/*.ts` |

## Apple · App Privacy（登录版）

Apple 的「收集」指：数据离开设备，并且我们或第三方能在超过实时处理所需的时间里接触到它。

**Do you or your third-party partners collect data from this app?** → **Yes**

| 数据类型 | 用途 | 关联到用户身份？ | 用于追踪？ |
|----------|------|------------------|------------|
| Contact Info → **Email Address** | App Functionality | **是** | 否 |
| Identifiers → **User ID** | App Functionality | **是** | 否 |
| Usage Data → **Product Interaction**（场次、时长、轮数等计数；活跃人数的假名从账号算出） | Analytics | **是** | 否 |
| User Content → **Other User Content**（练习对话和督导报告；报告评价和举报的那一段） | App Functionality | 否 | 否 |
| User Content → **Audio Data**（语音会谈打开后才勾；声音发给 ElevenLabs 转写） | App Functionality | 否 | 否 |

说明：

- Product Interaction 选「关联」，因为活跃人数的假名是从账号算出来的。按天的次数本身不带 ID。
- 对话和报告不和账号一起存，请求里也不带账号 ID 给模型服务，所以保持「不关联」。提交前再核一次：如果 `/chat`、`/supervision` 开始带会话头，并且服务端把它和内容一起记下来，就要改成「关联」。
- **不申报的**：Health & Fitness、Financial、Location、Sensitive Info、Contacts、Browsing / Search History、Purchases、Diagnostics。
  - Health & Fitness、Sensitive Info 不选：来访者是虚构的，对话不是用户本人的健康数据。我们也在 App 里要求用户不输入真实来访者信息。
  - Diagnostics 不选：我们只在服务端按错误码计数，不从设备收集诊断数据。
- 只存在设备上、从不发出的数据（练习记录、「关于你」）：不算收集。
- **Audio Data：语音会谈还关着的版本不勾，打开时要勾。** 按住说话的声音只在设备上处理，从不离开手机，不算收集。语音会谈的声音会离开手机发给 ElevenLabs，而且它的日志和备份可能留一段时间，不符合 Apple「只为实时处理」的例外，所以要勾。这个开关在服务器上，所以**先改好标签和商店填写，再在生产环境配 ElevenLabs 的密钥**，顺序不能反。

**Tracking：** 否。`NSPrivacyTracking = false`，没有追踪域名。

**Privacy manifest（`PrivacyInfo.xcprivacy`）对齐：**

```text
NSPrivacyTracking: false
NSPrivacyTrackingDomains: []
NSPrivacyCollectedDataTypes:
  - NSPrivacyCollectedDataTypeEmailAddress
      Linked: true, Tracking: false, Purposes: [AppFunctionality]
  - NSPrivacyCollectedDataTypeUserID
      Linked: true, Tracking: false, Purposes: [AppFunctionality]
  - NSPrivacyCollectedDataTypeProductInteraction
      Linked: true, Tracking: false, Purposes: [Analytics]
  - NSPrivacyCollectedDataTypeOtherUserContent
      Linked: false, Tracking: false, Purposes: [AppFunctionality]
  - NSPrivacyCollectedDataTypeAudioData   # 打开语音会谈的那次发版加上
      Linked: false, Tracking: false, Purposes: [AppFunctionality]
NSPrivacyAccessedAPITypes:
  - NSPrivacyAccessedAPICategoryUserDefaults: [CA92.1]
  - NSPrivacyAccessedAPICategoryFileTimestamp: [C617.1]
  - NSPrivacyAccessedAPICategorySystemBootTime: [35F9.1]
```

**账号删除（审核指南 5.1.1(v)）：** 能在 App 里注册账号，就必须能在 App 里发起删除。我们在「我的 → 删除账号」。

**审核指南 5.1.2(i)：** 把个人数据发给第三方 AI 之前，要明确告诉用户并取得同意。第一次打开时的 O2「先说清楚」页满足这一条，不要删。语音会谈的声音发给 ElevenLabs，O2 没有覆盖，靠语音会谈前单独的同意页（`VoiceConsentSheet`）满足。

## Google Play · Data safety（登录版）

Google 的「收集」指：数据离开设备。「共享」指：转给第三方。代我们处理数据的服务商（模型服务、Vercel、Neon、Slack、Resend）不算共享。

**Does your app collect or share any of the required user data types?** → **Yes**

**Is all of the user data collected by your app encrypted in transit?** → **Yes**

**Account creation methods** → 用邮箱和一次性验证码，选最接近的「Username and other authentication」。如果有单独的「Other」或一次性密码选项，以当时的选项为准。

**Do you provide a way for users to request that their data is deleted?** → **Yes**，填 `https://psygym.novawerk.io/delete-account`。

**Delete account URL**（账号删除要求）→ 同一个地址。App 内也能删。

| 数据类别 → 类型 | 收集 / 共享 | 临时处理？ | 必需还是可选 | 用途 |
|-----------------|-------------|------------|--------------|------|
| Personal info → **Email address** | 收集；不共享 | 否 | 必需 | Account management、App functionality |
| Personal info → **User IDs**（账号 ID 和统计用的假名） | 收集；不共享 | 否 | 必需 | Account management、Analytics |
| App activity → **App interactions**（场次、时长等计数） | 收集；不共享 | 否 | 必需 | Analytics |
| App activity → **Other user-generated content**（对话、报告；报告评价和举报） | 收集；不共享 | 否（评价和举报留在 Slack） | 必需 | App functionality |

| Audio → **Voice or sound recordings**（语音会谈打开后才填） | 收集；不共享（ElevenLabs 是代我们处理的服务商）。这一点要在签 DPA 后再确认 | 否（它的日志和备份可能留一段时间） | 可选 | App functionality |

不申报：Location、Financial info、Health and fitness、Messages、Photos and videos、Files and docs、Calendar、Contacts、Web browsing、App info and performance、Device or other IDs。语音会谈还关着的版本也不申报 Audio。

`RECORD_AUDIO` 的说明。语音会谈还关着时，照旧回答：「Only for hold-to-talk. Audio is turned into text on the device and is never uploaded or stored.」打开语音会谈后改成：「Hold-to-talk: audio is turned into text on the device and never uploaded. Voice session (optional, after a separate consent): audio is streamed to ElevenLabs to transcribe it; we don't record it.」

## 登录前版（2026-10-11 保存在 Play Console，未送审）

供对照。带登录的新版送审前，要按上面的登录版改。

- **Data safety**：
  - Other user-generated content：收集、不共享、不是临时处理、必需、App functionality。
  - App interactions：收集、不共享、不是临时处理、必需、Analytics。
  - 传输加密：是。账号：不能注册。
  - 删除方式：是，链接到 [privacy-policy.md#your-rights](./privacy-policy.md#your-rights)。
- **要改的地方**：
  - 账号创建方式改成邮箱加验证码。
  - 加 Email address、User IDs。
  - 删除链接换成 `https://psygym.novawerk.io/delete-account`，并填 Delete account URL。
- **Apple**：没填过，直接填登录版。

## 每次改代码后检查

下面任何一条变了，就回来改这份文档和 [privacy-policy.md](./privacy-policy.md)：

- 新增 SDK（尤其是 Firebase、崩溃统计、分析）
- 新增接口，或者请求里多了字段
- 在生产环境打开或关闭语音会谈，或者 ElevenLabs 的保留设置、套餐变了
- 换模型服务商或邮件服务商
- 本机存储加密，或者练习记录开始上云
- 账号存的字段变了，或者开始把账号和对话关联
