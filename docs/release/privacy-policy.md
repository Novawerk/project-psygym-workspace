# 聆镜 PSYGYM 隐私政策 · Privacy Policy

> 草稿。标「待定」的地方要在正式上架前补齐。内容按 2026-10-10 的代码和已定的决定写（[safety.md](../safety.md)、[0005](../decisions/0005-local-practice-history.md)、[open-decisions.md](../product/open-decisions.md) D3、D6、D7）。App 里的隐私说明页（P3，[copy.md](../product/copy.md)）是短版，意思要和这里一致。

生效日期：待定　·　版本：草稿 2026-10-10

---

## 中文

### 这是什么

聆镜 PSYGYM 是给心理咨询师的练习工具。AI 扮演虚构的来访者，练完由 AI 督导给反馈。它不是心理治疗，不给来访者用。

运营者：待定（见 [README](./README.md)「上架主体」）。联系我们：info@novawerk.io。

### 我们处理哪些数据

| 数据 | 去哪 | 存多久 |
|------|------|--------|
| **练习对话**：你和 AI 来访者的每一句 | 每一轮，App 把整段对话发到我们的服务器，服务器转给第三方 AI 模型服务生成回复。 | 我们的服务器不保存，日志里也不记录对话内容。AI 模型服务按它自己的政策处理（见下方「第三方」）。 |
| **督导报告** | 由 AI 模型服务根据对话生成，经我们的服务器发回 App。 | 同上。 |
| **练习记录**：每场的病例编号、开始和结束时间、对话、报告和技能标签 | 只存在你的手机上，App 自己的存储空间里。不上传，不进 iCloud 或 Google 云备份，也不跟着换机迁移。 | 存到你删除为止。可以在「我的」里关掉保存、全部删除，也可以单场删除。卸载 App 就全部删除。记录**没有加密**，保存在 App 的私有空间里。 |
| **报告评价**：👍 / 👎，加你写的一句话（最多 500 字），以及病例编号、界面语言 | 只有你主动点了才发。经我们的服务器转到我们内部的 Slack 频道（第三方服务）。不带对话。 | 留在 Slack 频道里，用来改进 App。你可以发邮件让我们删除。 |
| **邀请码** | 存在你的手机上。每次请求都带给我们的服务器，用来确认测试资格、控制请求频率。 | 服务器不写入数据库，也不记在日志里。频率统计只在内存里保留一个时间窗口。 |
| **界面语言、「关于你」、声明确认版本** | 只存在你的手机上。 | 存到你修改或卸载为止。 |
| **IP 地址等网络信息** | 任何联网请求都会带。我们的服务器托管在 Vercel（法兰克福）。没有邀请码时，我们用 IP 控制请求频率。 | 我们的代码不记录 IP。Vercel 平台自己的访问日志按 Vercel 的政策保留。 |

### 我们不做的事

- 没有账号。不收集姓名、手机号、邮箱、位置、通讯录、照片。
- 没有广告，没有分析或崩溃统计 SDK，不追踪你，也不把数据卖给任何人。
- 我们自己不用你的对话训练模型。AI 模型服务会不会用，按它的 API 条款（见下方「第三方」）。

### 请不要输入真实来访者的信息

这是练习工具。请不要在对话里写真实来访者的姓名、经历或任何能认出一个人的细节。万一写了，那段对话会经过我们的服务器和 AI 模型服务；如果你开着本机保存，它也会留在你手机上，直到你删除。

### 第三方

| 服务 | 做什么 | 在哪 |
|------|--------|------|
| AI 模型服务（目前是 DeepSeek，以 App 隐私说明页显示的为准） | 生成来访者回复和督导报告 | 待定：按服务商写明所在地区 |
| Vercel | 托管我们的服务器 | 欧盟（法兰克福） |
| Slack | 接收报告评价 | 美国 |

我们只把完成功能需要的内容发给它们。

### 你的权利

你可以随时在 App 里删除本机的练习记录。我们的服务器本来就不保存对话，所以没有可以导出或删除的对话。报告评价如果要删除，请写信到 info@novawerk.io，并告诉我们大概的时间和病例。

如果你在欧盟，你有 GDPR 规定的访问、更正、删除、限制处理、反对处理和向监管机构投诉的权利。处理依据：练习对话和督导报告，是为了提供你要求的服务；报告评价，基于你的同意（你主动点了才发）。如果你在中国大陆，你有《个人信息保护法》规定的权利。

### 年龄

聆镜 PSYGYM 面向成年的心理咨询从业者和学员，不面向 18 岁以下的人。

### 改动

这份政策有实质改动时，我们更新生效日期，并在 App 里再请你确认一次。

---

## English

### What this is

聆镜 PSYGYM is a practice tool for counselors. An AI plays a fictional client; afterwards an AI supervisor gives feedback. It is not therapy and not for clients.

Operator: to be decided (see [README](./README.md), "Publisher"). Contact: info@novawerk.io.

### What we process

| Data | Where it goes | How long |
|------|---------------|----------|
| **Practice conversation**: every message between you and the AI client | Each turn, the app sends the conversation so far to our server, which passes it to a third-party AI model service to write the reply. | Our server doesn't store it or log its text. The AI model service handles it under its own policy (see "Third parties"). |
| **Supervision report** | Written by the AI model service from the conversation, sent back to the app through our server. | Same as above. |
| **Practice history**: case id, start and end time, messages, report and skill tags for each session | Only on your phone, in the app's own storage. Not uploaded, not in iCloud or Google cloud backups, not moved to a new phone. | Until you delete it. Turn saving off or delete everything under Me; delete a single session from your history. Uninstalling the app deletes everything. Records are **not encrypted**; they sit in the app's private storage. |
| **Report rating**: 👍 / 👎, the line you write (up to 500 characters), the case id and interface language | Only when you tap. Sent through our server to our internal Slack channel (a third-party service). The conversation is never included. | Kept in the Slack channel to improve the app. Email us to have it deleted. |
| **Invite code** | On your phone. Sent with each request so our server can check access and limit request rates. | Not written to a database or logs. Rate counts live in memory for one time window. |
| **Language, "About you", disclaimer version** | Only on your phone. | Until you change it or uninstall. |
| **IP address and other network data** | Part of every network request. Our server runs on Vercel (Frankfurt). Without an invite code, we use the IP to limit request rates. | Our code doesn't log IPs. Vercel's own access logs follow Vercel's policy. |

### What we don't do

- No accounts. We don't collect your name, phone number, email, location, contacts or photos.
- No ads, no analytics or crash-reporting SDKs, no tracking, no selling of data.
- We don't use your conversations to train models ourselves. Whether the AI model service does depends on its API terms (see "Third parties").

### Please don't enter real client information

This is a practice tool. Don't type real clients' names, histories or anything that could identify someone. If you do, that conversation passes through our server and the AI model service, and, if saving is on, stays on your phone until you delete it.

### Third parties

| Service | What for | Where |
|---------|----------|-------|
| AI model service (currently DeepSeek; the in-app Privacy page shows the current one) | Writes client replies and supervision reports | To be decided: state the provider's region |
| Vercel | Hosts our server | EU (Frankfurt) |
| Slack | Receives report ratings | United States |

We only send them what the feature needs.

### Your rights

You can delete practice history in the app at any time. Our server doesn't keep conversations, so there are none to export or delete. To have a report rating deleted, email info@novawerk.io with the rough time and case.

In the EU you have the GDPR rights of access, rectification, erasure, restriction, objection and to complain to a supervisory authority. Legal basis: conversations and reports, to provide the service you ask for; report ratings, your consent (sent only when you tap). In mainland China you have the rights under the Personal Information Protection Law.

### Age

聆镜 PSYGYM is for adult counseling professionals and trainees. It is not for anyone under 18.

### Changes

When this policy changes in substance, we update the date and ask you to confirm again in the app.

---

## 正式上架前要解决（不进正式文本）

- **运营者主体和地址。** GDPR 要求写明控制者是谁。
- **AI 模型服务的数据所在地。** 如果生产环境用 DeepSeek，对话会传到中国境内的服务器。对欧盟用户，这是 GDPR 第五章说的跨境传输，要有合法依据（比如标准合同条款），否则要换成欧盟或有充分性认定的服务商。这一条要团队定。
- **AI 模型服务会不会保留对话、会不会拿来训练**：按生产环境实际用的服务商的 API 条款写清楚。
- **代码和这份政策是否一致**：2026-10-10 的 main 还没有本机练习记录和报告评价（在 #37 及后续 PR 里）。发正式版前用当时的代码再核一遍。
- **隐私政策的正式地址**：先用 GitHub 链接，正式上架前换成 novawerk.io 上的页面。
