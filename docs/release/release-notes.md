# 发行说明 · Release notes

每个版本一节，发布从这里直接复制：

- **Play 发行说明：** 商店有 en-US 和 zh-CN 两种语言，每种不超过 500 字符，按 `<en-US>…</en-US><zh-CN>…</zh-CN>` 的格式贴进 Play Console。
- **TestFlight · What to Test：** App Store Connect 只有 English (U.S.) 一种语言，所以是一段中英合在一起的，不超过 4000 字符。

版本号在 `apps/mobile/gradle/libs.versions.toml`。iOS 的 build number 由 Xcode Cloud 的 `CI_BUILD_NUMBER` 决定，只往上涨（`iosApp/ci_scripts/ci_post_clone.sh`）。

## 0.3.1（versionCode 4）

0.3.0 没有通过 App 审核（2026-10-30）。这一版只改审核要求的内容，只发 iOS。

### TestFlight · What to Test

```
聆镜 PSYGYM 是给新手心理咨询师的练习工具：AI 扮演来访者，练完由 AI 督导给反馈。来访者都是虚构的。

这一版改了：
· 「开始之前」页写明发什么、发给谁：对话经我们的服务器发给位于中国的 DeepSeek。这件事要单独勾选同意。用过上一版的人会再看到这一页。
· 隐私政策写全了。

问题和想法发到 info@novawerk.io。请不要输入真实来访者的信息。

聆镜 PSYGYM is a practice tool for new counselors: an AI plays the client, and an AI supervisor gives feedback afterwards. Every client is fictional.

What changed:
· The "Before we start" page now says what is sent and to whom: the conversation goes through our server to DeepSeek in China. You agree to this with its own tick box. If you used the last version, you'll see this page again.
· The privacy policy is complete.

Send problems and ideas to info@novawerk.io. Please don't enter real client information.
```

### App Store · What's New

```
We now say clearly what we send to the AI service and who runs it, and ask for your consent first. The privacy policy is complete.
```

## 0.3.0（versionCode 3）

### Play 发行说明

```
<en-US>
New in this version:
· Hold to talk: in a session, tap the mic, hold and speak. Your voice becomes text on your phone, never uploaded; edit it before sending. First use downloads a 169 MB speech model, once; Wi-Fi is better.
· A shorter intro: no language page. The app follows your phone's language; switch with 中 / EN or under Me.
· Open-source licences under Me.
聆镜 PSYGYM is a practice tool for counselors, not for clients. Please don't enter real client information.
</en-US>
<zh-CN>
这一版新增：
· 按住说话：会谈页点麦克风，按住说话。声音只在手机上转成文字，不上传；转出来的文字可以改了再发。第一次使用要下载约 169 MB 的语音识别模型，只下载一次，建议连 Wi-Fi。
· 首次引导更短：不再单独问语言，默认跟随手机；右上角「中 | EN」和「我的」里都能换。
· 「我的」里新增「开源许可」。
聆镜 PSYGYM 是给咨询师的练习工具，不给来访者用。请不要输入真实来访者的信息。
</zh-CN>
```

### TestFlight · What to Test

```
聆镜 PSYGYM 是给新手心理咨询师的练习工具：AI 扮演来访者，练完由 AI 督导给反馈。来访者都是虚构的。

这一版新增：
· 按住说话：会谈页输入框左边的麦克风，点一下切到「按住说话」。按住说，上滑取消，松手后文字进输入框，改好再发。声音只在手机上转成文字，不上传。
  - iPhone：用系统自带的离线语音识别。iOS 26 第一次用时，系统可能会先下载语言模型。手机不支持离线识别时，会提示不能用，不会改走联网识别。
  - 安卓：第一次用要下载约 169 MB 的模型，只下载一次，建议连 Wi-Fi。下载后离线可用；不想留着可以在「我的」里删除。
· 首次引导去掉了单独的语言页：默认跟随手机语言，右上角「中 | EN」和「我的」里都能换。
· 「我的」里新增「开源许可」。

请重点帮我们看按住说话，并告诉我们手机型号和系统版本：
1. 第一次按住时，要等多久才开始出字（模型加载时间）？
2. 说话后多快出现第一个字？松手后多久出全文？
3. 认得准不准？中文、英文和中英混说都试一下，专业词比如「自动思维」「认知歪曲」。
4. 连续用十分钟左右，手机发不发热、掉电快不快？

问题和想法发到 info@novawerk.io。请不要输入真实来访者的信息。

聆镜 PSYGYM is a practice tool for new counselors: an AI plays the client, and an AI supervisor gives feedback afterwards. Every client is fictional.

New in this version:
· Hold to talk: in a session, tap the mic left of the input to switch to "Hold to talk". Hold and speak, slide up to cancel; when you let go, the text goes into the input box for you to edit and send. Your voice is turned into text on your phone and never uploaded.
  - iPhone: Apple's built-in offline recognition. On iOS 26 the system may download a language model the first time. If your phone can't recognise speech offline, the app says so and never falls back to online recognition.
  - Android: the first time, the app downloads a speech model of about 169 MB, once; Wi-Fi is better. It works offline after that, and you can delete it under Me.
· The intro has no separate language page: the app follows your phone's language; switch with 中 / EN or under Me.
· Open-source licences under Me.

Please test hold to talk first, and tell us your phone model and system version:
1. The first time you hold, how long until words appear (model loading)?
2. How fast does the first word show while you speak? How long after you let go until the full text?
3. How accurate is it? Try Chinese, English and a mix, and terms like "automatic thoughts" or "cognitive distortion".
4. After about ten minutes of use, does the phone get warm or lose battery fast?

Send problems and ideas to info@novawerk.io. Please don't enter real client information.
```

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
