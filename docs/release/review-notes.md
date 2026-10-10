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
| 功能太少，或者审核员进不去 | Apple 2.1、4.2 | 给审核员一个专用邀请码；后端在审核期间必须在线 | 审核期间不改 `INVITE_CODES`，不停服务 |
| 隐私标签和实际不符 | Apple 5.1.1、5.1.2；Play User Data 政策 | [privacy-labels.md](./privacy-labels.md) 按代码写 | 每次发版前核一遍 |

## 给审核员的说明（Review Notes / App access 说明）

TestFlight 的 Beta App Review、App Store 审核、Play 的 App access 都可以用这段。邀请码由用户在后台填，不写进这里。

> **What this app is.** 聆镜 PSYGYM is a training tool for counseling students and new counselors. It is not a therapy or mental-health app for patients, and it gives no diagnosis or treatment. An AI plays a fictional client with depression or anxiety; the trainee practises a counseling session; afterwards an AI supervisor gives feedback on the trainee's technique.
>
> **How to test.**
> 1. On first launch, read the "Before we start" page and tick the box. (It explains that this is not therapy, the clients are fictional, and the conversation is sent to a third-party AI model.)
> 2. On the next page, enter the invite code: `<filled in App Store Connect / Play Console, not in the repo>`. You can also enter it later under Me → Settings.
> 3. Pick a case, read the brief, tap "Start session", and type a few counselor lines (for example, "What brings you here today?").
> 4. Tap "End", then read the supervision report.
>
> **Safety.** Cases are low to moderate risk. The AI client may mention dark thoughts as written in the case, but never describes methods. A "Need help?" page with crisis guidance is always one tap away and works offline. If the trainee is abusive, the AI client reacts like a real person and ends the session on the second time.
>
> **Data.** No accounts. Our server doesn't store conversations. Practice history stays on the device and can be deleted in the app. See the privacy policy.
>
> **Contact.** info@novawerk.io

## 提交前检查

- [ ] 文案、截图、关键词里没有「治疗、疗效、诊断、患者」，也没有 therapy app、treatment
- [ ] O2 同意页、首页短版声明、病例简介页的内容提示、会谈页的「需要帮助？」都在
- [ ] 审核员邀请码有效，而且不会被限流
- [ ] 后端 `https://psygym-api.novawerk.io` 在线，生产环境配了模型服务的 key
- [ ] 隐私政策链接能打开
- [ ] 隐私标签和 `PrivacyInfo.xcprivacy` 一致
- [ ] Play 的 AI 内容举报入口（D8）在当前 build 里能用
