# 审核要注意的点（心理健康类）

审核员看到「心理」「抑郁」「自杀」这些词，会按心理健康类 App 严格看。我们要让他们一眼看明白：这是**给咨询师的训练工具**，不是给患者的治疗 App。

## 风险和我们怎么应对

| 风险 | 来源 | 我们的做法 | 还要做的 |
|------|------|------------|----------|
| 被当成医疗或治疗 App | Apple 1.4.1；Play Health apps 政策 | 文案、截图、分类（Education）都写「训练工具，不是治疗，不给来访者用」。首次打开必须勾选同意（O2） | 商店文案和截图照 [store-listing.md](./store-listing.md)，不写「治疗、疗效、诊断」 |
| 个人开发者提交受监管领域的 App | Apple 5.1.1(ix) | 说明我们是教育培训，不提供医疗服务 | 正式上架前定上架主体，见 [README](./README.md) |
| 把数据发给第三方 AI 没有事先告知 | Apple 5.1.2(i) | O2 第 3 条说明并要求勾选；隐私说明页写了服务商名称 | 保持。服务商改了要同步改文案 |
| 危机情况下用户没地方求助 | Apple 1.4.1 的精神；Play 对心理类内容的审查 | 会谈页常驻「需要帮助？」，不需要网络 | 热线号码**还没核实**（待聆镜确认）。正式版前最好有核实过的号码，至少要有几个主要地区的 |
| AI 输出冒犯性内容 | Apple 1.1、1.2；**Play AI-Generated Content 政策要求 App 里能举报或标记冒犯性的 AI 内容，而且不用离开 App** | 提示词有安全边界（[safety.md](../safety.md) §3、§4）；报告页的 👎 和一句话（D7）；**举报单条 AI 内容**（D8：来访者回复或报告里的一段，`POST /report`，服务端见 #47） | App 端做好后，提交前在真机上试一遍举报流程 |
| 未成年人使用 | 两边的分级 | 分级定 18+，目标受众选 18+ | |
| 功能太少，或者审核员进不去 | Apple 2.1、4.2；Play App access | **登录版**：一个固定的审核员邮箱加固定验证码（[login.md](../product/login.md) 第 4 节），不发邮件、不受尝试次数限制、不用邀请码。**登录前的 build**：用审核员专用邀请码 | 每次提交审核前换一个新码，填进后台；审核期间不清空 `REVIEW_LOGIN_EMAIL`、`REVIEW_LOGIN_CODE`，不停服务 |
| 有账号却删不掉 | Apple 5.1.1(v)；Play 账号删除要求 | App 内「我的 → 删除账号」；网页 `https://psygym.novawerk.io/delete-account` 说明不用 App 时怎么申请 | 网页在 Google 送审前上线；提交前在真机上试一遍删除 |
| 麦克风权限说不清楚 | Apple 5.1.1(i)、2.5.2；Play 权限和设备滥用政策 | 按住说话时用，声音在手机上转文字，不上传；语音会谈时声音发给 ElevenLabs，用户单独同意后才开始（默认关）；iOS 只用端侧识别；安卓的语音模型是数据文件，不是代码 | 每次送审前确认给审核员的说明里有「Microphone」一段 |
| 语音会谈把声音发给第三方 | Apple 5.1.1、5.1.2(i)、2.5.14；Play User Data 政策 | 功能默认关，服务器没配 ElevenLabs 就看不到入口。打开后，开始前有单独的说明和同意，写明声音发给美国公司 ElevenLabs。麦克风权限说明也改了 | **打开前：** 隐私标签、数据安全表、隐私政策都按 [privacy-labels.md](./privacy-labels.md) 改好；给审核员的说明加下面的「Voice session」一段 |
| 隐私标签和实际不符 | Apple 5.1.1、5.1.2；Play User Data 政策 | [privacy-labels.md](./privacy-labels.md) 按代码写 | 每次发版前核一遍 |

## 给审核员的说明（Review Notes / App access 说明）

TestFlight 的 Beta App Review、App Store 审核、Play 的 App access 都可以用这段。审核员邮箱、验证码和邀请码都只填在后台，不写进仓库。

### 登录信息填在哪（登录版）

| 后台 | 位置 | 填什么 |
|------|------|--------|
| App Store Connect（App Store 审核） | App Review Information → Sign-in required：勾选 | User name 填审核员邮箱，Password 填固定验证码 |
| App Store Connect（TestFlight） | Test Information → Beta App Review Information → Sign-in required：勾选 | 同上 |
| Play Console | App content → Sign in details → Add details | Username 填审核员邮箱，Password 填固定验证码；「Any other information」照下面的 How to test 写；「允许 Google 测试设备使用」保持关闭 |

值从后端环境变量 `REVIEW_LOGIN_EMAIL`、`REVIEW_LOGIN_CODE` 来，由用户或总控当面给，发布只负责填进后台。

### 说明正文（登录版）

> **What this app is.** 聆镜 PSYGYM is a training tool for counseling students and new counselors. It is not a therapy or mental-health app for patients, and it gives no diagnosis or treatment. An AI plays a fictional client with depression or anxiety; the trainee practises a counseling session; afterwards an AI supervisor gives feedback on the trainee's technique.
>
> **How to test.**
> 1. On first launch, read the "Before we start" page and tick the box. (It explains that this is not therapy, the clients are fictional, and the conversation is sent to a third-party AI model.)
> 2. Sign in with the reviewer email in the sign-in details. Tap "Send code"; no email is sent to this address. Enter the code from the sign-in details. No invite code is needed for this account.
> 3. Pick a case, read the brief, tap "Start session", and type a few counselor lines (for example, "What brings you here today?").
> 4. Tap "End", then read the supervision report.
> 5. To test account deletion: Me → Delete account. You can sign in again with the same email and code; a new account is created.
>
> **Safety.** Cases are low to moderate risk. The AI client may mention dark thoughts as written in the case, but never describes methods. A "Need help?" page with crisis guidance is always one tap away and works offline. If the trainee is abusive, the AI client reacts like a real person and ends the session on the second time.
>
> **Data.** Sign-in uses an email and a one-time code. Our server stores only the email, sign-up date, invite batch and sessions. It doesn't store conversations. Practice history stays on the device and can be deleted in the app. Accounts can be deleted in the app or via https://psygym.novawerk.io/delete-account. See the privacy policy.
>
> **Microphone (0.3.0 and later).** The microphone is used only for the optional "Hold to talk" button in a session. Speech is turned into text on the device and is never uploaded or stored; the text goes into the input box, and the trainee edits and sends it like typed text. On iPhone we use Apple's on-device speech recognition only; if the device can't recognise speech offline, the app says so and does not fall back to server recognition. On Android, the first use downloads a speech model of about 169 MB (data files, not executable code) from our server; after that it works offline, and it can be deleted under Me. You can complete every test step by typing; the microphone is not required.
>
> **Voice session (only when it is switched on for this build; leave this paragraph out otherwise).** On the case brief, "Voice session" starts a live call with the AI client. Before the first one, a separate notice says the trainee's voice is sent live to ElevenLabs, a US company, to be transcribed, and asks for consent; the trainee can decline and keep typing. The app holds no ElevenLabs key: it gets a one-time token from our server. Calls are not recorded. The client's words come from the same server-side prompt and safety rules as typed sessions. Afterwards the transcript goes to the supervision report as usual. Leaving the app ends the call.
>
> **Contact.** info@novawerk.io

### 登录前的 build（现在 TestFlight 和 Play 内部测试里的 0.1.0）

把第 2 步换成：

> 2. On the next page, enter the invite code: `<filled in App Store Connect / Play Console, not in the repo>`. You can also enter it later under Me → Settings.

Data 一段里去掉登录和账号删除那两句。Apple 用 `review-…`、Play 用 `play-…` 两个分开的码，见后台。

## 提交前检查

- [ ] 文案、截图、关键词里没有「治疗、疗效、诊断、患者」，也没有 therapy app、treatment
- [ ] O2 同意页、首页短版声明、病例简介页的内容提示、会谈页的「需要帮助？」都在
- [ ] 登录版：审核员邮箱和**这次新换的**验证码在后端生效，用 curl 或真机试过；后台填的是同一组值
- [ ] 登录前的 build：审核员邀请码有效，而且不会被限流
- [ ] App 内删除账号能用；`https://psygym.novawerk.io/delete-account` 能打开（Google 送审前必须上线）
- [ ] 隐私标签里 Other User Content 选「不关联」的前提仍然成立：发给模型服务的请求不带账号 ID，服务端也不把会话和对话内容记在一起
- [ ] 后端 `https://psygym-api.novawerk.io` 在线，生产环境配了模型服务的 key
- [ ] 隐私政策链接能打开。登录版送审时，把后台的链接从 GitHub 上的 md 换成官网：ASC（App 隐私政策、TestFlight Test Information）和 Play（App content → Privacy policy）填 `https://psygym.novawerk.io/en/privacy`（中文页 `/zh/privacy`）；Play 数据安全表的删除链接和 Delete account URL 填 `https://psygym.novawerk.io/delete-account`
- [ ] 隐私标签和 `PrivacyInfo.xcprivacy` 一致
- [ ] 语音会谈：这次提交时生产环境开没开，和隐私标签、数据安全表、Review Notes 一致；开着的话，在真机上走一遍同意页和一通完整的语音会谈
- [ ] Play 的 AI 内容举报入口（D8）在当前 build 里能用
