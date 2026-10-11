# 发行说明 · Release notes

每个版本一节，发布从这里直接复制：

- **Play 发行说明：** 商店有 en-US 和 zh-CN 两种语言，每种不超过 500 字符，按 `<en-US>…</en-US><zh-CN>…</zh-CN>` 的格式贴进 Play Console。
- **TestFlight · What to Test：** App Store Connect 只有 English (U.S.) 一种语言，所以是一段中英合在一起的，不超过 4000 字符。

版本号在 `apps/mobile/gradle/libs.versions.toml`。iOS 的 build number 由 Xcode Cloud 的 `CI_BUILD_NUMBER` 决定，只往上涨（`iosApp/ci_scripts/ci_post_clone.sh`）。

## 0.2.0（versionCode 2）

### Play 发行说明

```
<en-US>
New in this version:
· Sign in with an email code. New accounts need an invite code. Your practice history stays on your phone.
· Mid-session notes: after 3 turns, tap "Supervisor's take" for quick tips. Up to 5 per session.
· The report is now in cards: your words, the problem and "Try instead".
· The case brief marks a first session.
· A consistent look and many small fixes.
聆镜 PSYGYM is a practice tool for counselors, not for clients. Please don't enter real client information.
</en-US>
<zh-CN>
这一版新增：
· 用邮箱验证码登录。新账号注册时要邀请码；练习记录还是只存在你的手机上。
· 会谈中途看督导：说满 3 句后，点顶部的「督导怎么看」，看几条简短提示。每场最多 5 次。
· 督导报告改成卡片：原话、问题和「可以换成」分开显示。
· 病例简介标出「初次会谈」和这次的主要任务。
· 样式按设计稿统一，修了一批小问题。
聆镜 PSYGYM 是给咨询师的练习工具，不给来访者用。请不要输入真实来访者的信息。
</zh-CN>
```

### TestFlight · What to Test

```
聆镜 PSYGYM 是给新手心理咨询师的练习工具：AI 扮演来访者，练完由 AI 督导给反馈。来访者都是虚构的。

这一版先要登录：
· 输入邮箱，收 6 位验证码，输入。收不到先看垃圾邮件。
· 第一次注册要邀请码，找聆镜团队要。用过上一版的人，会自动用上手机里存着的邀请码。
· 在「我的」里可以退出登录，也可以删除账号。

请重点试这两样：
1. 会谈中途看督导：说满 3 句后，点顶部的「督导怎么看」。提示有没有用？会不会打断你？
2. 督导报告的新样式：结束会谈后看报告卡片。原话、问题和「可以换成」看得清楚吗？

问题和想法发到 info@novawerk.io。请不要输入真实来访者的信息。

聆镜 PSYGYM is a practice tool for new counselors: an AI plays the client, and an AI supervisor gives feedback afterwards. Every client is fictional.

This version starts with sign-in:
· Enter your email, get a 6-digit code, type it in. No code? Check your spam folder.
· A new account needs an invite code; ask the Lingjing team. If you used the last version, the invite code saved on your phone is used for you.
· Under Me you can sign out, or delete your account.

Please try these two first:
1. Mid-session notes: after 3 turns, tap "Supervisor's take" at the top. Are the notes useful? Do they get in the way?
2. The new report: end a session and read the report cards. Are your words, the problem and "Try instead" easy to follow?

Send problems and ideas to info@novawerk.io. Please don't enter real client information.
```
