# 聆镜 PSYGYM 隐私政策 · Privacy Policy

> 内容按已定的决定写（[safety.md](../safety.md)、[0005](../decisions/0005-local-practice-history.md)、[open-decisions.md](../product/open-decisions.md) D3、D6、D7、D8，[login.md](../product/login.md)、[ADR 0008](../decisions/0008-sign-in.md)）。官网 `psygym.novawerk.io/privacy` 直接读这个文件。App 里的隐私说明页（P3，[copy.md](../product/copy.md)）是短版，意思要和这里一致。

生效日期：2026-10-30　·　版本：1.0

---

## 中文

### 这是什么

聆镜 PSYGYM 是给心理咨询师的练习工具。AI 扮演虚构的来访者，练完由 AI 督导给反馈。它不是心理治疗，不给来访者用。

运营者：Novawerk。联系我们：info@novawerk.io。

### 我们处理哪些数据

| 数据 | 去哪 | 存多久 |
|------|------|--------|
| **练习对话**：你和 AI 来访者的每一句 | 只有你在 App 里同意之后才发送。每一轮，App 把整段对话发到我们的服务器，服务器转给第三方 AI 服务 DeepSeek（在中国）生成回复。请求里有对话、病例内容和界面语言，没有你的邮箱和账号 ID。 | 我们的服务器不保存，日志里也不记录对话内容。DeepSeek 按它自己的隐私政策处理（见下方「第三方」）。 |
| **语音会谈的声音**（只在你选了语音会谈并同意后） | 通话时实时发给 ElevenLabs（美国公司）转成文字，来访者的声音也由它合成。声音不经过我们的服务器。 | 我们不接触、不保存声音。我们设置 ElevenLabs 不录音（`record_voice` 关）。 |
| **语音会谈的转写** | ElevenLabs 把你说的话转成文字，经我们的服务器交给 DeepSeek 写回复；转写也实时发回 App，用来显示和生成督导报告。 | 我们的服务器不保存。我们设置 ElevenLabs 在通话结束后删除转写；删除后，它的调试和审核日志里可能还留有相关数据，备份最长保留 30 天。我们的套餐没有零保留模式。 |
| **督导报告** | 由 DeepSeek 根据对话生成，经我们的服务器发回 App。 | 同上。 |
| **练习记录**：每场的病例编号、开始和结束时间、对话、报告和技能标签 | 只存在你的手机上，App 自己的存储空间里。不上传，不进 iCloud 或 Google 云备份，也不跟着换机迁移。 | 存到你删除为止。可以在「我的」里关掉保存、全部删除，也可以单场删除。卸载 App 就全部删除。记录**没有加密**，保存在 App 的私有空间里。 |
| **报告评价**：👍 / 👎，加你写的一句话（最多 500 字），以及病例编号、界面语言 | 只有你主动点了才发。经我们的服务器转到我们内部的 Slack 频道（第三方服务）。不带对话。 | 留在 Slack 频道里，用来改进 App。你可以发邮件让我们删除。 |
| **举报**：你举报的那一段 AI 内容（一条来访者回复，或报告里的一段），举报原因，你写的一句话（最多 500 字），以及病例编号、界面语言 | 只有你主动举报才发。发送前 App 会把要发的那一段给你看。经我们的服务器转到我们内部的 Slack 频道。**只发这一段，不发这场会谈的其余内容。** | 留在 Slack 频道里，用来改进提示词和安全边界。你可以发邮件让我们删除。 |
| **邮箱** | 你登录时填写。我们用它发验证码，并作为你的账号。存在我们的数据库里（Neon，法兰克福）。验证码邮件经 Resend 发送（见「第三方」）。 | 存到你删除账号为止。 |
| **注册时间、邀请码批次** | 注册时记下。邀请码只在注册时用一次，用来确认测试资格；我们只记下它属于哪一批（例如「聆镜内测第一批」），不存邀请码本身。 | 存到你删除账号为止。 |
| **登录会话** | 登录后，服务器发给 App 一个会话凭证，App 存在手机的安全存储里（iOS 钥匙串、Android 加密存储），每次请求带上。服务器只存它的哈希。 | 90 天没用就失效，每次使用自动续期。退出登录或删除账号时马上删除。 |
| **验证码** | 发到你的邮箱。服务器只存它的加密摘要（带密钥的 HMAC），不存验证码本身。 | 10 分钟后失效；用过、过期或删除账号时删除。 |
| **界面语言** | 存在你的手机上。每次请求也会带给我们的服务器：用来决定来访者和报告用哪种语言（会写进发给 AI 模型服务的指令里），并按语言统计次数。 | 服务器不单独保存它。它会出现在：服务器日志（和病例编号、条数等一起记，不含对话）、使用统计（见下一行）、验证码邮件的语言、你主动发出的报告评价和举报（转到 Slack）。 |
| **使用统计**：按天、按病例和界面语言的次数（开始了几场、来访者主动结束几场、写了几份报告、每场几轮、出错几次、👍/👎 和举报几次）和时长汇总（一场多长；App 结束会谈时把这场的秒数发给服务器） | 由我们的服务器从收到的请求里统计，存在我们的数据库里（Neon，法兰克福）。 | 只存汇总后的数字，不带任何 ID，不存单场记录，不存对话，不存 IP 或设备 ID。汇总数字长期保留，用来看趋势。 |
| **假名的使用数据**：用来统计每天、每周有多少人在用 | 你当天第一次用（发起会谈或生成报告）时，服务器用带密钥的 HMAC 从你的账号 ID 算出一个假名，记一行。假名每天、每周换一次，不同天、不同周的对不上；持有密钥的我们能为某个账号重新算出来，所以这是假名，不是匿名。不存邮箱和账号 ID。 | 当天的明细第二天汇总成一个人数后删除，每周的明细在周末汇总后删除。删除账号时，当天和本周那一行也一起删除。 |
| **「关于你」、声明确认版本** | 只存在你的手机上。 | 存到你修改或卸载为止。 |
| **IP 地址等网络信息** | 任何联网请求都会带。我们的服务器托管在 Vercel（法兰克福）。我们用 IP 控制请求频率（例如发送验证码的次数），只在内存里。 | 我们的代码不记录 IP。Vercel 平台自己的访问日志按 Vercel 的政策保留。 |

### 我们不做的事

- 账号只用邮箱。不收集姓名、手机号、位置、通讯录、照片，也不用第三方账号登录。
- 没有广告，没有分析或崩溃统计 SDK，不追踪你，也不把数据卖给任何人。我们自己只在服务器上做上面那种汇总统计和假名的活跃人数统计。
- 我们自己不用你的对话训练模型。DeepSeek 的 API 条款没有写明会不会用（见下方「第三方」）。

### 请不要输入真实来访者的信息

这是练习工具。请不要在对话里写或说真实来访者的姓名、经历或任何能认出一个人的细节。万一写了，那段对话会经过我们的服务器和 AI 模型服务（语音会谈还会经过 ElevenLabs）；如果你开着本机保存，它也会留在你手机上，直到你删除。

### 语音会谈

语音会谈是可选功能，和打字、按住说话分开。第一次使用前 App 会单独说明，你同意后才开始。按住说话的声音只在手机上处理，语音会谈的声音会离开手机。你的声音是真实的个人信息，即使来访者是虚构的。不想发送声音，就不要用语音会谈；你也可以随时在「我的」里撤回同意，打字和按住说话不受影响。

### 第三方

| 服务 | 做什么 | 在哪 |
|------|--------|------|
| DeepSeek（杭州深度求索人工智能基础技术研究有限公司） | 生成来访者回复和督导报告。收到对话、病例内容和界面语言。按[它的隐私政策](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html)处理：政策写明数据存放在中国，我们不控制它保留多久。我们和它之间没有单独的数据处理协议，所以不能保证它提供和我们相同的保护，请不要输入任何能认出一个人的信息。 | 中国 |
| ElevenLabs（Eleven Labs Inc.，纽约） | 语音会谈：把声音转成文字，合成来访者的声音 | 美国。对欧盟用户属于数据出境。ElevenLabs 的隐私政策写明数据转到美国存储；欧盟、英国和瑞士用户的相关主体是 ElevenLabs Poland sp. z o.o. |
| Vercel | 托管我们的服务器 | 欧盟（法兰克福） |
| Neon | 数据库，存账号（邮箱、注册时间、批次、会话哈希）和统计 | 欧盟（法兰克福） |
| Resend | 发送验证码邮件（收件邮箱、邮件内容） | Resend 是美国公司；我们用它在欧盟区发送。作为美国公司，数据可能被传到美国或受美国法律管辖，属于数据出境，依据它的标准合同条款。它的发送日志按它的政策保留。 |
| Slack | 接收报告评价和举报 | 美国 |

我们只把完成功能需要的内容发给它们。

### 你的权利

**删除账号：** 在 App 里「我的」→「删除账号」，马上删除服务器上的邮箱、注册时间、邀请码批次和登录会话，手机上这个账号的练习记录也一起删除。不能用 App 时，按 [psygym.novawerk.io/delete-account](https://psygym.novawerk.io/delete-account) 的说明，用注册邮箱写信给我们，我们 30 天内删除并回信。

你也可以随时在 App 里删除本机的练习记录。我们的服务器本来就不保存对话，所以没有可以导出或删除的对话。想要一份我们存的账号信息，写信到 info@novawerk.io。报告评价和举报不带账号和邮箱，我们认不出哪些是你的，所以没法按账号删除；如果你记得大概的时间和病例，写信告诉我们，我们尽量找。

如果你在欧盟，你有 GDPR 规定的访问、更正、删除、限制处理、反对处理和向监管机构投诉的权利。处理依据：把对话发给 DeepSeek，是你在 App 里的明确同意（想撤回就停止使用并删除账号，之后不再发送）；账号、练习对话和督导报告，是为了提供你要求的服务；活跃人数的假名统计，基于我们改进服务的正当利益；报告评价和举报，基于你的同意（你主动点了才发）；语音会谈的声音，基于你的同意（开始前单独同意，可以在 App 里撤回）。如果你在中国大陆，你有《个人信息保护法》规定的权利。

### 年龄

聆镜 PSYGYM 面向成年的心理咨询从业者和学员，不面向 18 岁以下的人。

### 改动

这份政策有实质改动时，我们更新生效日期，并在 App 里再请你确认一次。

---

## English

### What this is

聆镜 PSYGYM is a practice tool for counselors. An AI plays a fictional client; afterwards an AI supervisor gives feedback. It is not therapy and not for clients.

Operator: Novawerk. Contact: info@novawerk.io.

### What we process

| Data | Where it goes | How long |
|------|---------------|----------|
| **Practice conversation**: every message between you and the AI client | Sent only after you agree in the app. Each turn, the app sends the conversation so far to our server, which passes it to DeepSeek, a third-party AI service in China, to write the reply. The request holds the conversation, the case text and your interface language, not your email or account ID. | Our server doesn't store it or log its text. DeepSeek handles it under its own privacy policy (see "Third parties"). |
| **Voice in a voice session** (only if you choose a voice session and agree) | Sent live to ElevenLabs (a US company) during the call to be turned into text; ElevenLabs also makes the client's voice. Your voice doesn't pass through our server. | We never receive or store your voice. We've set ElevenLabs not to record calls (`record_voice` off). |
| **Voice-session transcript** | ElevenLabs turns what you say into text, which goes through our server to DeepSeek to write the reply; the transcript also comes back to the app live, to show it and to write the report. | Our server doesn't store it. We've set ElevenLabs to delete the transcript after the call; after deletion its debugging and moderation logs may still hold related data, and backups last up to 30 days. Our plan has no zero-retention mode. |
| **Supervision report** | Written by the AI model service from the conversation, sent back to the app through our server. | Same as above. |
| **Practice history**: case id, start and end time, messages, report and skill tags for each session | Only on your phone, in the app's own storage. Not uploaded, not in iCloud or Google cloud backups, not moved to a new phone. | Until you delete it. Turn saving off or delete everything under Me; delete a single session from your history. Uninstalling the app deletes everything. Records are **not encrypted**; they sit in the app's private storage. |
| **Report rating**: 👍 / 👎, the line you write (up to 500 characters), the case id and interface language | Only when you tap. Sent through our server to our internal Slack channel (a third-party service). The conversation is never included. | Kept in the Slack channel to improve the app. Email us to have it deleted. |
| **Report**: the AI passage you report (one client reply, or one passage of the report), the reason, the note you write (up to 500 characters), the case id and interface language | Only when you report. The app shows you the passage before sending. Sent through our server to our internal Slack channel. **Only that passage, never the rest of the session.** | Kept in the Slack channel to improve prompts and safety rules. Email us to have it deleted. |
| **Email** | You enter it to sign in. We use it to send sign-in codes and as your account. Stored in our database (Neon, Frankfurt). Code emails are sent through Resend (see "Third parties"). | Until you delete your account. |
| **Sign-up date, invite batch** | Recorded when you sign up. The invite code is used once, at sign-up, to check access; we only record which batch it belongs to (for example "Lingjing pilot 1"), never the code itself. | Until you delete your account. |
| **Session** | After sign-in, our server gives the app a session token, kept in the phone's secure storage (iOS Keychain, Android encrypted storage) and sent with each request. Our server stores only its hash. | Expires after 90 days without use; each use extends it. Deleted right away when you sign out or delete your account. |
| **Sign-in code** | Sent to your email. Our server stores only a keyed digest (HMAC) of it, never the code. | Expires after 10 minutes; deleted once used, expired, or when you delete your account. |
| **Interface language** | On your phone. Also sent with each request: it decides which language the client and the report use (it goes into the instructions sent to the AI model service), and we count by language. | Our server doesn't store it on its own. It appears in: server logs (with the case id, message count and similar, never the conversation), the usage counts (next row), the language of the code email, and ratings and reports you choose to send (forwarded to Slack). |
| **Usage counts**: numbers per day, case and interface language (sessions started, sessions the client ended, reports written, turns per session, errors, 👍/👎 ratings and reports) and duration totals (how long a session lasts; when you end a session the app sends its length in seconds) | Counted by our server from the requests it receives, stored in our database (Neon, Frankfurt). | Only totals, with no id of any kind: no per-session rows, no conversation, no IP or device ID. Totals are kept long-term to see trends. |
| **Pseudonymous usage data**: to count how many people use the app each day and week | The first time you use the app on a day (start a session or get a report), our server derives a pseudonym from your account ID with a keyed HMAC and records one row. The pseudonym changes every day and every week, so days and weeks can't be linked; because we hold the key, we can recompute it for an account, so it is pseudonymous, not anonymous. No email or account ID is stored. | Each day's rows are summed into a count the next day and deleted; each week's rows are summed and deleted at the end of the week. When you delete your account, today's and this week's rows go too. |
| **"About you", disclaimer version** | Only on your phone. | Until you change it or uninstall. |
| **IP address and other network data** | Part of every network request. Our server runs on Vercel (Frankfurt). We use the IP to limit request rates (for example, how often codes are sent), in memory only. | Our code doesn't log IPs. Vercel's own access logs follow Vercel's policy. |

### What we don't do

- Accounts use email only. We don't collect your name, phone number, location, contacts or photos, and there is no third-party sign-in.
- No ads, no analytics or crash-reporting SDKs, no tracking, no selling of data. On our own server we only keep the totals and the pseudonymous active-user counts described above.
- We don't use your conversations to train models ourselves. DeepSeek's API terms don't say whether it does (see "Third parties").

### Please don't enter real client information

This is a practice tool. Don't type or say real clients' names, histories or anything that could identify someone. If you do, that conversation passes through our server and the AI model service (in a voice session, ElevenLabs too), and, if saving is on, stays on your phone until you delete it.

### Voice sessions

A voice session is optional and separate from typing and hold to talk. The app explains it before your first one, and it starts only after you agree. In hold to talk your voice stays on your phone; in a voice session it leaves your phone. Your voice is real personal data even though the client is fictional. If you don't want to send it, don't use voice sessions; you can also withdraw consent under Me at any time. Typing and hold to talk are unaffected.

### Third parties

| Service | What for | Where |
|---------|----------|-------|
| DeepSeek (Hangzhou DeepSeek Artificial Intelligence Co., Ltd.) | Writes client replies and supervision reports. Receives the conversation, the case text and your interface language. It handles them under [its privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html), which says data is stored in China, and we don't control how long it keeps them. We have no separate data processing agreement with it, so we can't promise it gives the same protection we do. Please don't enter anything that could identify a person. | China |
| ElevenLabs (Eleven Labs Inc., New York) | Voice sessions: turns voice into text, makes the client's voice | United States. For EU users this is a transfer outside the EU. ElevenLabs' privacy policy says data is transferred to the US for storage; for the EU, UK and Switzerland the entity is ElevenLabs Poland sp. z o.o. |
| Vercel | Hosts our server | EU (Frankfurt) |
| Neon | Database for accounts (email, sign-up date, batch, session hashes) and counts | EU (Frankfurt) |
| Resend | Sends sign-in code emails (recipient address, email text) | Resend is a US company; we send through its EU region. As a US company, data may go to the US or fall under US law, which is a transfer outside the EU, based on its standard contractual clauses. Its sending logs are kept under its policy. |
| Slack | Receives report ratings and reports | United States |

We only send them what the feature needs.

### Your rights

**Delete your account:** in the app, Me → Delete account. We delete your email, sign-up date, invite batch and sessions from our server right away, and this account's practice history on your phone too. If you can't use the app, follow the steps at [psygym.novawerk.io/delete-account](https://psygym.novawerk.io/delete-account): write to us from the email you signed up with, and we delete it within 30 days and reply.

You can also delete practice history in the app at any time. Our server doesn't keep conversations, so there are none to export or delete. For a copy of the account data we hold, email info@novawerk.io. Ratings and reports don't carry your account or email, so we can't delete them by account; if you remember the rough time and case, write to us and we'll try to find them.

In the EU you have the GDPR rights of access, rectification, erasure, restriction, objection and to complain to a supervisory authority. Legal basis: sending the conversation to DeepSeek, your explicit consent in the app (to withdraw it, stop using the app and delete your account; nothing more is sent); your account, conversations and reports, to provide the service you ask for; pseudonymous active-user counts, our legitimate interest in improving the service; report ratings and reports, your consent (sent only when you tap); your voice in a voice session, your consent (asked separately before you start, withdrawable in the app). In mainland China you have the rights under the Personal Information Protection Law.

### Age

聆镜 PSYGYM is for adult counseling professionals and trainees. It is not for anyone under 18.

### Changes

When this policy changes in substance, we update the date and ask you to confirm again in the app.

---

## 正式上架前要解决（不进正式文本）

- **运营者主体和地址。** 现在写 Novawerk（用户 2026-10-30 定）。App Store 卖家是个人账号，两者不一致；GDPR 还要求写明控制者的地址。
- **AI 模型服务的数据所在地。** 生产环境用 DeepSeek 官方 API（没配 `LLM_BASE_URL`，走 `api.deepseek.com`），对话传到中国。对欧盟用户，这是 GDPR 第五章说的跨境传输。现在靠 App 里单独勾选的明确同意，它的 API 条款里没有 DPA。长期要换成欧盟托管或有 DPA 的服务商，这一条要团队定。
- **AI 模型服务会不会保留对话、会不会拿来训练**：DeepSeek 的 API 条款（2026-04-29 版）没有写，政策里写的是我们现在查到的情况。换服务商时重写。
- **代码和这份政策是否一致**：登录版按 [login.md](../product/login.md) 和 [ADR 0008](../decisions/0008-sign-in.md) 写。发正式版前用当时的代码再核一遍，特别是：邀请码不入库只记批次、会话只存哈希、验证码用 HMAC、假名明细的删除时间。
- **Resend 的发送日志保留期**：按 Resend 的政策核对后补具体天数。
- **ElevenLabs（语音会谈打开前必须解决）：** 用公司名义接受或签它的数据处理协议（DPA），用户定先测试、之后再签；确认跨境传输的依据（DPF 或 SCC，同意页和这份政策要写明）。训练已关（用户，2026-10-30）。继续用 Creator 套餐，声音留在美国（用户，2026-10-30）。现在是 Creator 套餐，没有零保留模式；上面写的保留情况是 2026-10-30 实测的（见 [ADR 0013](../decisions/0013-voice-elevenlabs.md)）。声音算不算生物识别数据，要有人按 GDPR 第 9 条判断。
- **这份政策先于语音功能合并时：** 政策已经是 1.0 版并在官网生效。语音会谈的几行写的是「选了才有」，功能关着时不影响别的用户；打开语音时要更新生效日期和版本，并在 App 里再请用户确认。
- **匿名统计和时长**（[admin.md](../product/admin.md)）：上线时核对代码只存汇总、`durationSec` 只是一个数字。
- **邀请码搬进数据库以后**（后台 Epic 2）：数据库会存邀请码的哈希和批次名称。到时「邀请码批次」那一行补一句「数据库存邀请码的哈希，用来作废和管理」。英文一起改。
- **隐私政策的正式地址**：`psygym.novawerk.io/privacy`（官网直接读这个文件，见 [landing.md](../product/landing.md)）。
