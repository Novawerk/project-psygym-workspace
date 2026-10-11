# 网站（landing page）

**状态：内容规格（2026-10-11），外观待用户确认。** 我们定了：PSYGYM 有一个自己的网站，地址 `psygym.novawerk.io`，中英双语、可以切换；代码放在本仓库 `apps/web`，以后能整个交给聆镜。删除账号的网页也放在这里。实现由后端成员做。

设计稿：第 ⑨ 行（桌面和手机两种宽度）：<https://claude.ai/artifact/UkqiioLoNiSB618ks8dPvg>（内部链接，需要分享后才能打开）。

## 页面和地址

| 页面 | 中文 | English | 内容来源 |
|------|------|---------|----------|
| 首页 | `/zh/` | `/en/` | 本文第 2 节 |
| 隐私说明 | `/zh/privacy` | `/en/privacy` | [`docs/release/privacy-policy.md`](../release/privacy-policy.md) |
| 删除账号 | `/zh/delete-account` | `/en/delete-account` | 本文第 4 节（要点来自 [login.md](./login.md)） |

- **根地址 `/`、`/privacy`、`/delete-account`**：按浏览器语言跳到 `/zh/…` 或 `/en/…`；判断不出来时去中文（目标市场未定，见 [questions-for-psygym.md](./questions-for-psygym.md) C1，定了再调）。Google Play 填的删除地址是 `psygym.novawerk.io/delete-account`，它会自动跳到对应语言。
- **语言切换**：每页右上角「中 | EN」，切换后留在同一页的另一种语言。用户的选择存在浏览器里（只是一个语言偏好，不是追踪）。
- **不放任何统计、广告或第三方追踪脚本，不用 cookie**，所以不需要 cookie 弹窗。字体自托管，不从第三方加载。
- 静态网站，没有登录、没有表单。

## 文风

- 短句，「我们」，现在时。和 App 一致。
- 不夸大：不说「替代督导」「提升 X%」「最好的」「革命性」；不用 leverage / ecosystem / stakeholders / synergy / disrupt / transform。
- 明说这是练习工具，不是心理治疗，不给来访者用。
- 英文里 App 名写「聆镜 PSYGYM」（和 App 一致），团队名写「the 聆镜 (Lingjing) team」。

---

## 1. 外观

- 和 App 一致：zinc 配色（白底、zinc-950 文字、zinc-200 边框、zinc-100 浅灰块、zinc-900 黑底白字主按钮），深色模式跟随系统。圆角卡片 12、按钮 8。
- 字体：思源黑体（Noto Sans SC），英文用同一套。
- 宽度：内容最宽 1080px，居中。手机宽度下各块上下排列。
- 图：首页顶部放一张 App 截图（会谈页或报告页，演示数据），用手机外框。不用插画素材网站的图。

---

## 2. 首页的块（从上到下）

### 2.1 顶栏

左：Logo（黑色小方块加圆环）+「聆镜 PSYGYM」。右：「中 | EN」。手机宽度下同样一行。

### 2.2 一句话介绍（首屏）

| | 中文 | English |
|---|------|---------|
| 标题 | 和 AI 来访者练一场，再听听督导怎么说 | Practise with an AI client. Then hear what a supervisor would say. |
| 副标题 | 给新手心理咨询师的练习工具。AI 扮演虚构的来访者；会谈结束后，AI 督导引用你的原话，告诉你哪里做得好、哪里可以改。 | A practice tool for new counselors. An AI plays a fictional client. After the session, an AI supervisor quotes your own words: what went well, what to change. |
| 主按钮 | 加入内测 | Join the beta |
| 次按钮 | 看看怎么用 | See how it works |
| 小字 | 目前只有 CBT 初次会谈，病例由聆镜团队的心理学同事撰写。 | For now: CBT first sessions. The cases are written by psychologists on the 聆镜 (Lingjing) team. |

- 「加入内测」跳到第 2.6 块；「看看怎么用」跳到第 2.3 块。
- 右边（手机宽度下在下面）是一张 App 截图。

### 2.3 怎么用（三步）

| | 中文 | English |
|---|------|---------|
| 块标题 | 怎么用 | How it works |
| 第 1 步 | **选一个病例。** 每位来访者都是虚构的，有自己的经历、说话方式和不愿意说的事。 | **Pick a case.** Every client is fictional, with their own story, way of talking and things they'd rather not say. |
| 第 2 步 | **开始会谈。** 你是咨询师。AI 扮演来访者，像真人一样回应你。卡住的时候，可以先看一眼督导的简短提示。 | **Hold the session.** You are the counselor. The AI plays the client and responds like a real person. If you get stuck, you can take a quick look at the supervisor's notes. |
| 第 3 步 | **看督导反馈。** 会谈结束后，督导引用你的原话：哪里做得好，哪里可以改，下次练什么。 | **Read the supervision.** At the end, the supervisor quotes your words: what went well, what to change, what to practise next. |

### 2.4 安全边界

| | 中文 | English |
|---|------|---------|
| 块标题 | 先说清楚 | Before you start |
| 1 | **这不是心理治疗。** 这是给咨询师的练习工具，不给来访者用。 | **This is not therapy.** It's a practice tool for counselors, not for clients. |
| 2 | **来访者是虚构的。** 由 AI 扮演。请不要输入真实来访者的任何信息。 | **The clients are fictional.** An AI plays them. Please don't enter any real client information. |
| 3 | **不能替代真人督导。** AI 督导的反馈只供练习参考，不是资质评估，也不是临床意见。建议和你的督导一起讨论。 | **It doesn't replace a human supervisor.** The AI feedback is for practice only. It isn't an assessment or clinical advice. Talk it over with your supervisor. |
| 4 | **遇到危机，请找真人。** 如果你或身边的人有危险，请马上联系当地急救电话或心理援助热线。这个工具不能在危机中提供帮助。 | **In a crisis, reach a person.** If you or someone near you is in danger, call your local emergency number or a crisis line now. This tool can't help in a crisis. |

### 2.5 隐私要点

| | 中文 | English |
|---|------|---------|
| 块标题 | 你的练习，留在你手里 | Your practice stays with you |
| 1 | **服务器不存对话。** 对话交给 AI 模型服务生成回复，我们的服务器不保存。 | **Our server doesn't keep your sessions.** An AI model service writes the replies; our server doesn't store the conversation. |
| 2 | **练习记录只在你手机上。** 可以关掉，可以删除，不上传。 | **Your history stays on your phone.** Turn it off or delete it any time. It's never uploaded. |
| 3 | **只用邮箱登录。** 我们只存邮箱和登录需要的几样东西。 | **Sign in with email only.** We keep your email and what sign-in needs, nothing more. |
| 4 | **随时能删除账号。** 在 App 里删，或者[按这里的说明](/delete-account)申请。 | **Delete your account any time.** In the app, or [follow these steps](/delete-account). |
| 链接 | 读完整的隐私说明 → | Read the full privacy notice → |

### 2.6 加入内测（上架前）

| | 中文 | English |
|---|------|---------|
| 块标题 | 内测中 | In beta |
| 正文 | 我们正在和几位咨询师一起测试。想参加的话，写信告诉我们你的背景（在读、执业几年、督导），我们发邀请码给你。 | We're testing with a small group of counselors. To join, write to us with a line about your background (student, years in practice, supervisor) and we'll send you an invite code. |
| 按钮 | 写信给我们 | Write to us |
| 按钮链接 | `mailto:info@novawerk.io?subject=加入聆镜 PSYGYM 内测` | `mailto:info@novawerk.io?subject=Join the 聆镜 PSYGYM beta` |

**上架以后**这一块换成两个商店徽章（App Store、Google Play）加一句「免费下载」/「Free download」（价格以上架时为准），标题改成「下载」/「Download」。徽章用两家官方的素材和规定的尺寸。

### 2.7 谁在做

| | 中文 | English |
|---|------|---------|
| 块标题 | 谁在做 | Who makes it |
| 正文 | 聆镜 PSYGYM 由聆镜团队和 Novawerk 一起做。聆镜团队的心理学同事写病例和督导标准，Novawerk 负责开发。代码和文档在 GitHub 公开，MIT 许可。 | 聆镜 PSYGYM is made by the 聆镜 (Lingjing) team and Novawerk. Psychologists on the Lingjing team write the cases and the supervision rubric; Novawerk builds the app. The code and docs are open on GitHub under the MIT licence. |
| 链接 | GitHub → · Novawerk → | GitHub → · Novawerk → |

### 2.8 页脚

| 中文 | English |
|------|---------|
| 隐私说明 · 删除账号 · GitHub · info@novawerk.io | Privacy · Delete account · GitHub · info@novawerk.io |
| © 2026 聆镜团队和 Novawerk | © 2026 the 聆镜 (Lingjing) team and Novawerk |

---

## 3. 隐私说明页（/privacy）

- 渲染 [`docs/release/privacy-policy.md`](../release/privacy-policy.md)：`/zh/privacy` 只显示「中文」一节，`/en/privacy` 只显示「English」一节。
- **不渲染**文件开头的草稿说明和最后的「正式上架前要解决（不进正式文本）」一节。
- 页面顶部显示「生效日期 / 版本」那一行。正式生效前，在标题下面加一行「草稿，正式版上架前发布。」/「Draft. The final version is published before launch.」
- 内容只改 `privacy-policy.md`，网站构建时读这个文件，不在网站里另存一份。

---

## 4. 删除账号页（/delete-account）

Google Play 要求的网页删除入口。要点来自 [login.md](./login.md)。

| | 中文 | English |
|---|------|---------|
| 标题 | 删除你的聆镜 PSYGYM 账号 | Delete your 聆镜 PSYGYM account |
| 简介 | 聆镜 PSYGYM 是聆镜团队和 Novawerk 做的心理咨询练习 App。这一页说明怎么删除账号。 | 聆镜 PSYGYM is a counseling practice app made by the 聆镜 (Lingjing) team and Novawerk. This page explains how to delete your account. |
| 小标题 1 | 最快的办法：在 App 里删 | The quickest way: in the app |
| 步骤 | 打开 App → 「我的」→「删除账号」，按提示确认。马上生效。 | Open the app → Me → Delete account, and confirm. It takes effect right away. |
| 小标题 2 | 不能用 App 时：写信给我们 | Can't use the app? Write to us |
| 步骤 | 用你注册时的邮箱写信到 info@novawerk.io，主题写「删除我的聆镜 PSYGYM 账号」。我们人工处理，30 天内删除，删完回信确认。 | From the email you signed up with, write to info@novawerk.io with the subject "Delete my 聆镜 PSYGYM account". We handle it by hand, delete it within 30 days, and reply when it's done. |
| 按钮 | 写信申请删除 | Email us to delete |
| 按钮链接 | `mailto:info@novawerk.io?subject=删除我的聆镜 PSYGYM 账号` | `mailto:info@novawerk.io?subject=Delete my 聆镜 PSYGYM account` |
| 小标题 3 | 删除什么 | What we delete |
| 内容 | 邮箱、注册时间、注册时用的邀请码批次、登录会话。 | Your email, sign-up date, the invite batch you used, and your sessions. |
| 小标题 4 | 不删什么 | What stays |
| 内容 | 已经汇总的统计数字：它们不带账号。你以前发出的报告评价和举报：在我们的 Slack 频道里，不带账号和邮箱，我们认不出哪些是你的。 | Totals already counted: they don't carry your account. Ratings and reports you sent earlier: they're in our Slack channel without your account or email, so we can't tell which are yours. |
| 小标题 5 | 手机上的练习记录 | Practice history on your phone |
| 内容 | 只在你手机上，我们碰不到。在 App 里删除账号时会一起删除；卸载 App 也会删除。 | It's only on your phone; we can't reach it. Deleting your account in the app deletes it too, and so does uninstalling the app. |

---

## 5. SEO 和分享

| | 中文 | English |
|---|------|---------|
| `<title>`（首页） | 聆镜 PSYGYM · 和 AI 来访者练习心理咨询 | 聆镜 PSYGYM · Practise counseling with an AI client |
| `description`（首页，≤ 120 字 / 160 字符） | 给新手心理咨询师的练习工具：和 AI 扮演的虚构来访者进行 CBT 初次会谈，结束后拿到引用你原话的督导反馈。不是心理治疗。 | A practice tool for new counselors: hold a CBT first session with a fictional AI client, then get supervision feedback that quotes your own words. Not therapy. |
| `<title>`（隐私） | 隐私说明 · 聆镜 PSYGYM | Privacy · 聆镜 PSYGYM |
| `<title>`（删除账号） | 删除账号 · 聆镜 PSYGYM | Delete account · 聆镜 PSYGYM |

- **OG 图：** 1200×630，白底；左边「聆镜 PSYGYM」字标和中文标题（英文页用英文标题），右边一张 App 会谈页截图（演示数据），zinc 配色。中英各一张：`og-zh.png`、`og-en.png`。
- `og:title`、`og:description` 同上表；`og:type = website`；`twitter:card = summary_large_image`。
- 每页加 `hreflang`（`zh-CN`、`en`、`x-default` 指向根地址）和 `canonical`。
- 删除账号页 `noindex` 不需要：它要能被搜到。
- favicon 用 App 图标。

## 6. 交付前检查

- [ ] 中英两种语言、深浅两种颜色、手机和桌面两种宽度都看一遍。
- [ ] 页面里没有夸大的说法，没有「替代督导」。
- [ ] 安全边界块在首屏往下一屏之内能看到。
- [ ] 没有任何统计、追踪脚本，没有 cookie。
- [ ] 隐私说明页和 `privacy-policy.md` 一致；删除账号页和 App 里的删除说明一致。
- [ ] Google Play 后台填的删除地址能打开，并跳到正确的语言。
