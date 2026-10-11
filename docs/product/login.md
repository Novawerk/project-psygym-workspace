# 登录和账号

**状态：规格（2026-10-11）。** 我们定了：App 要有账号（D-A1 = F），在 demo（10/17）前做完。这份写清楚流程、页面、文案、规则和要改的隐私文档。接口由后端在 `api-contract.md` 里定，这里只写要求。

## 已定

- **只有邮件验证码一种登录方式。** 国内也能用。不做 Google 登录，所以苹果也不要求「通过 Apple 登录」。
- **App 里能删除账号。** 苹果硬性要求，Google Play 也要求。
- **练习记录还是只存在手机上。** 服务器照旧不存对话。
- **服务器只存：** 邮箱、注册时间、来自哪个邀请码批次、登录会话。另外，统计用一个从账号算出来的匿名 ID（见第 5 节），不存邮箱。

---

## 1. 流程

### 新用户

```
O1 欢迎 → O2 先说清楚（勾选同意）→ O3 准备开始（只选语言）
  → L1 输入邮箱 → L2 输入验证码 →（新账号）L3 输入邀请码 → H1 首页
```

- **邀请码只在注册时输一次**，用来控制谁能进。之后每次请求靠登录会话，不再带邀请码。
- **为什么邀请码放在验证码之后：** 先确认邮箱是用户本人的，再要邀请码。老用户在 L2 之后直接进首页，不会被问邀请码。
- O3 原来的「邀请码」区块去掉，O3 只剩语言；底部只留一个「继续」（`onb_ready_continue`：继续 / Continue），去掉「先跳过」。

### 老用户（已有账号）

- 换手机、重装、退出后再登：L1 → L2 → H1。
- 登录会话 90 天，每次使用自动续期。90 天没打开过 App，下次打开回到 L1。

### 已经在用旧版（没有登录）的人怎么迁移

旧版只在手机上存了邀请码。更新到带登录的版本后：

1. 打开 App，已经勾选过 O2 的人不再看引导，直接到 L1。L1 上方加一行说明：「现在需要用邮箱登录。练习记录还在这台手机上。」
2. L2 验证通过后，如果是新账号，App 把手机上存着的旧邀请码自动带上去注册，**跳过 L3**。旧码已经作废时，才显示 L3 让用户重新输。
3. 手机上原有的练习记录，归到这个账号名下（见第 2 节「退出登录」）。
4. **服务器的过渡期：** 带登录的版本发出后，旧版（只带 `X-Invite-Code`、不带会话）再放行 14 天，之后返回「请更新 App」。日期由我们定，在 Slack 和邮件里提前通知内测用户。

### 审核员

见第 4 节。

---

## 2. 页面、布局和文案

沿用现有的 zinc 配色和组件：白底，zinc-950 文字，zinc-100 浅灰卡片，zinc-900 黑底白字主按钮，圆角卡片 12、按钮和输入框 8。设计稿里有 L1、L2、L3、「我的」账号区和删除确认（见文末），**外观要用户在看板上确认后再做**。

### L1 输入邮箱

**布局（从上到下）：**

```
┌────────────────────────────┐
│ ← 返回                 中|EN │
│                            │
│ 用邮箱登录                    │  ← 大标题
│ 我们会发一个 6 位验证码到你的邮箱。 │  ← 副标题，灰色
│                            │
│ ┌────────────────────────┐ │
│ │ 邮箱                     │ │  ← 输入框，邮箱键盘，自动聚焦
│ └────────────────────────┘ │
│ （错误提示，红色小字）           │
│                            │
│          ……空白……            │
│                            │
│ [        发送验证码        ]   │  ← 主按钮；邮箱格式不对时不可点
│ 登录即表示你同意隐私说明。        │  ← 小字，「隐私说明」可点
└────────────────────────────┘
```

| key | 中文 | English |
|-----|------|---------|
| login_email_title | 用邮箱登录 | Sign in with email |
| login_email_subtitle | 我们会发一个 6 位验证码到你的邮箱。 | We'll email you a 6-digit code. |
| login_email_hint | 邮箱 | Email |
| login_email_send | 发送验证码 | Send code |
| login_email_invalid | 邮箱格式不对，请检查一下。 | That email doesn't look right. Please check it. |
| login_email_rate_limited | 发送太频繁了，请 %1$d 秒后再试。 | Too many requests. Try again in %1$d s. |
| login_privacy_note | 登录即表示你同意隐私说明。 | By signing in you agree to the privacy notice. |
| login_migration_note | 现在需要用邮箱登录。练习记录还在这台手机上。 | You now sign in with email. Your practice history stays on this phone. |

### L2 输入验证码

**布局：**

```
┌────────────────────────────┐
│ ← 返回（改邮箱）              │
│                            │
│ 输入验证码                    │
│ 已发送到 lin@example.com      │  ← 邮箱加粗；下面一行「改邮箱」链接
│                            │
│ [ ][ ][ ][ ][ ][ ]          │  ← 6 个方框，数字键盘，支持粘贴、
│                            │     支持系统从短信 / 邮件自动填充
│ （错误提示：码不对，还能试 3 次） │
│                            │
│ 没收到？检查一下垃圾邮件。         │
│ 重新发送（45 秒）               │  ← 倒计时结束后变成可点的链接
│                            │
│ [          登录          ]   │  ← 输满 6 位自动提交；按钮作为备用
└────────────────────────────┘
```

| key | 中文 | English |
|-----|------|---------|
| login_code_title | 输入验证码 | Enter the code |
| login_code_sent_to | 已发送到 %1$s | Sent to %1$s |
| login_code_change_email | 改邮箱 | Change email |
| login_code_submit | 登录 | Sign in |
| login_code_not_received | 没收到？检查一下垃圾邮件。 | Didn't get it? Check your spam folder. |
| login_code_resend | 重新发送 | Send again |
| login_code_resend_in | 重新发送（%1$d 秒） | Send again (%1$d s) |
| login_code_resent | 新的验证码已发送。 | We sent a new code. |
| login_code_wrong | 验证码不对，还能试 %1$d 次。 | That code isn't right. %1$d tries left. |
| login_code_expired | 验证码过期了，请重新发送。 | That code has expired. Send a new one. |
| login_code_locked | 输错次数太多，这个验证码已失效。请重新发送。 | Too many wrong tries. This code no longer works. Send a new one. |

### L3 输入邀请码（只有新账号）

**布局：**

```
┌────────────────────────────┐
│                            │
│ 还差一步                     │
│ 测试期间需要邀请码。邀请码由聆镜团队  │
│ 发放。                       │
│                            │
│ ┌────────────────────────┐ │
│ │ 邀请码                    │ │
│ └────────────────────────┘ │
│ （错误提示）                   │
│                            │
│ [        完成注册          ]   │
│ 没有邀请码？退出               │  ← 文字链接，回到 L1 并清空会话
└────────────────────────────┘
```

| key | 中文 | English |
|-----|------|---------|
| login_invite_title | 还差一步 | One more step |
| login_invite_body | 测试期间需要邀请码。邀请码由聆镜团队发放。 | We need an invite code during testing. The 聆镜 (Lingjing) team hands them out. |
| login_invite_hint | 邀请码 | Invite code |
| login_invite_submit | 完成注册 | Finish signing up |
| login_invite_invalid | 这个邀请码不对，或者已经作废了。 | This invite code isn't valid or has been turned off. |
| login_invite_none | 没有邀请码？退出 | No invite code? Sign out |

### 「我的」里的账号区（P1，加在最上面）

**布局：**

```
账号
┌────────────────────────────┐
│ 邮箱             lin@example.com │
│ 退出登录                   ›   │
│ 删除账号                   ›   │  ← 红字（破坏性操作）
└────────────────────────────┘
```

| key | 中文 | English |
|-----|------|---------|
| me_account_section | 账号 | Account |
| me_account_email | 邮箱 | Email |
| me_logout | 退出登录 | Sign out |
| me_delete_account | 删除账号 | Delete account |

原来「设置」组里的「邀请码」行去掉。

### 退出登录（底部弹层）

| key | 中文 | English |
|-----|------|---------|
| logout_title | 退出登录？ | Sign out? |
| logout_body | 这台手机上的练习记录会保留，下次用同一个邮箱登录还能看到。别人用这台手机登录时看不到。 | Your practice history stays on this phone. Sign in with the same email to see it again. Others who sign in on this phone won't see it. |
| logout_confirm | 退出登录 | Sign out |
| logout_cancel | 取消 | Cancel |

- **练习记录跟账号走：** 本机记录存的时候带上账号 ID。退出后记录不删，但只对同一个账号显示。换别人登录，看到的是空的记录列表。
- 退出时服务器作废这个会话。

### 删除账号（两步）

**第一步：说明页（全屏）**

```
┌────────────────────────────┐
│ ← 返回                       │
│ 删除账号                      │
│                            │
│ 删除后：                      │
│ · 我们服务器上的邮箱、注册时间、     │
│   邀请码批次和登录会话，马上删除。   │
│ · 统计里已经汇总的匿名数字不受影响，   │
│   它们本来就认不出你。            │
│ · 你以前发出的报告评价和举报在       │
│   Slack 里，不带邮箱；要删请发邮件  │
│   给 info@novawerk.io。        │
│                            │
│ 这台手机上的练习记录：            │
│ [✓] 一起删除                   │  ← 默认勾上
│                            │
│ 删除后不能恢复。之后可以用同一个邮箱  │
│ 重新注册，但需要新的邀请码。        │
│                            │
│ [        继续删除          ]   │  ← 红色主按钮
└────────────────────────────┘
```

**第二步：确认弹窗**

| key | 中文 | English |
|-----|------|---------|
| delete_title | 删除账号 | Delete account |
| delete_after | 删除后： | After you delete: |
| delete_server | 我们服务器上的邮箱、注册时间、邀请码批次和登录会话，马上删除。 | We delete your email, sign-up date, invite batch and sessions from our server right away. |
| delete_stats | 统计里已经汇总的匿名数字不受影响，它们本来就认不出你。 | Anonymous totals already counted stay. They can't identify you. |
| delete_slack | 你以前发出的报告评价和举报在 Slack 里，不带邮箱；要删请发邮件给 info@novawerk.io。 | Ratings and reports you sent earlier are in Slack, without your email. To remove them, email info@novawerk.io. |
| delete_local_label | 这台手机上的练习记录 | Practice history on this phone |
| delete_local_check | 一起删除 | Delete it too |
| delete_irreversible | 删除后不能恢复。之后可以用同一个邮箱重新注册，但需要新的邀请码。 | This can't be undone. You can sign up again with the same email, but you'll need a new invite code. |
| delete_continue | 继续删除 | Continue |
| delete_confirm_title | 确定删除账号？ | Delete your account? |
| delete_confirm_body | 输入 %1$s 的前 3 个字符确认。 | Type the first 3 characters of %1$s to confirm. |
| delete_confirm_action | 删除 | Delete |
| delete_done | 账号已删除。 | Your account has been deleted. |

- 第二步要求输入邮箱前 3 个字符，防止误点。
- 删除成功后，App 清空会话（和勾选时清空本机记录），回到 L1，并提示「账号已删除。」。
- 断网时不能删除，提示网络错误，什么都不清。

### 其他错误

| 情况 | 中文 | English |
|------|------|---------|
| 会话过期 / 被作废 | 登录已过期，请重新登录。 | Your session has expired. Please sign in again. |
| 旧版 App 过了过渡期 | 请更新到最新版本。 | Please update to the latest version. |
| 账号已被删除（另一台手机上删的） | 这个账号已经删除。 | This account has been deleted. |

会话失效时，正在进行的会谈不丢：先存本机，提示重新登录，登录后回到原来的页面。

---

## 3. 验证码规则

| 规则 | 值 |
|------|----|
| 长度 | 6 位数字 |
| 有效期 | 10 分钟 |
| 输错上限 | 同一个码输错 5 次就失效，要重新发送 |
| 重发间隔 | 60 秒 |
| 发送上限 | 同一个邮箱每小时最多 5 次，每天最多 20 次；同一个 IP 每小时最多 30 次 |
| 一次一个码 | 重新发送后，旧码立即失效 |
| 存法 | 服务器只存验证码的哈希；验证成功或过期后删除 |
| 不暴露邮箱是否注册 | 「发送验证码」不管邮箱有没有注册，都显示一样的结果 |
| 邮箱处理 | 去掉首尾空格、转小写后再用 |

### 验证码邮件

发件服务用 Resend（爱尔兰），和 Novawerk 同一套做法。发件地址：待定（例如 `no-reply@` 加我们的域名）。邮件按 App 当前的界面语言发；纯文字为主，不放图片和追踪像素，不放可点的登录链接（防钓鱼）。

**中文**

> 主题：聆镜 PSYGYM 验证码：123456
>
> 你的验证码是 **123456**，10 分钟内有效。
>
> 在 App 里输入这 6 位数字就能登录。
>
> 不是你本人在登录？忽略这封邮件就好，没有人能用它登录你的账号。
>
> 聆镜 PSYGYM 是给心理咨询师的练习工具。请不要回复这封邮件；有问题请写信到 info@novawerk.io。

**English**

> Subject: Your 聆镜 PSYGYM code: 123456
>
> Your code is **123456**. It works for 10 minutes.
>
> Enter these 6 digits in the app to sign in.
>
> Didn't try to sign in? Just ignore this email. Nobody can use it to get into your account.
>
> 聆镜 PSYGYM is a practice tool for counselors. Please don't reply to this email; write to info@novawerk.io with any questions.

主题里放验证码，方便用户在通知里直接看到。

---

## 4. 审核员怎么登录

苹果和 Google 的审核员收不到我们的验证码。做法：

- **一个固定的审核员邮箱，加一个固定验证码。** 邮箱和码都放在后端环境变量里（例如 `REVIEW_LOGIN_EMAIL`、`REVIEW_LOGIN_CODE`），不进仓库，不写进任何公开文档。
- **只对这一个邮箱有效。** 用这个邮箱点「发送验证码」时，服务器不发邮件；输入固定码就能登录。别的邮箱输这个码一律无效。
- **不用邀请码：** 这个账号预先建好，归到批次「store-review」，登录后直接进首页。
- **其余规则照常：** 输错上限、发送上限、IP 限流都照旧，防止被人猜到后乱用。
- **能随时关：** 不在审核期时，把环境变量清空，这条后门就不存在了。每次提交审核前重新设一个新码。
- **给审核员的说明：** 邮箱和码只填在两边商店后台的「审核备注 / 登录信息」里（`docs/release/review-notes.md` 里写怎么填，不写值）。
- **统计：** 审核员账号的活动不计入统计。

---

## 5. 统计：按账号算人数

改动 [admin.md](./admin.md) 第 1 节：「用户」改成按账号算，D-A1 定为 F。

- **匿名 ID：** 统计里不用账号 ID，更不用邮箱。用 `HMAC(统计密钥, 账号 ID)` 算出一个匿名 ID，统计密钥只在后端。数据库里统计相关的表只出现匿名 ID。
- **日活、周活：**
  - 每天记一张「当天活跃过的匿名 ID」表：用户发过一次 `/chat` 就算活跃。
  - 日活 = 当天的个数；周活 = 最近 7 天去重的个数。
  - 这张明细表只留 35 天，够算周活和月活；之后只留每天的汇总数字。
- **按批次：** 还能看每个邀请码批次的日活、周活（从账号的批次算出来，不需要另外存）。
- **展示阈值照旧：** 小于 5 显示「<5」，并防反推（见 [admin.md](./admin.md)）。
- **删除账号时：** 算出这个账号的匿名 ID，把它从 35 天的明细表里删掉。已经汇总的数字不动。
- **审核员账号不计入。**
- 原来按邀请码统计用量的设计（D-A1 选项 B）不再需要。邀请码表只管注册时的准入。

---

## 6. 要改的隐私和其他文档

登录上线（demo 前）时，下面这些要一起改。新文案给出了，照着改。

### `docs/safety.md` §1

加一条：

> - **账号只存最少的信息。** 用邮件验证码登录。服务器只存邮箱、注册时间、邀请码批次和登录会话，不存对话。用户在 App 里能删除账号，删除后这些马上删掉。统计只用从账号算出来的匿名 ID，不用邮箱。

### `docs/product/principles.md`

「不做账号。没有账号，就没有云端数据可泄露。」改成：

> - 有账号，但账号只是一把钥匙：服务器只存邮箱和登录需要的几样东西，不存练习内容。用户随时能在 App 里删除账号。

### App 隐私说明（`copy.md` 和 `screens.md` P3）

- `privacy_a_collect` 现在写的是「没有账号」，改成：
  > 你的邮箱（用来登录）、注册时间、你注册时用的邀请码批次，和登录会话。你选的界面语言每次请求会带上。不收集姓名、手机号、位置。
- 新增两问：

| key | 中文 | English |
|-----|------|---------|
| privacy_q_account | 账号存了什么？ | What does my account store? |
| privacy_a_account | 只有邮箱、注册时间、注册时用的邀请码批次和登录会话。练习对话和报告不在服务器上，只在你手机上。 | Only your email, sign-up date, the invite batch you used and your sessions. Practice conversations and reports aren't on our server, only on your phone. |
| privacy_q_delete | 怎么删除账号？ | How do I delete my account? |
| privacy_a_delete | 在「我的」→「删除账号」。删除后，服务器上的账号信息马上删掉；手机上的练习记录可以选择一起删。 | Go to Me → Delete account. We delete your account data from our server right away; you can choose to delete the practice history on your phone too. |

- `privacy_a_stats` 加半句：「人数用匿名 ID 统计，不用邮箱。」

### `docs/release/privacy-policy.md`（中英）

- 「我们处理哪些数据」加三行：
  - **邮箱**：用来发验证码和登录；存在我们的数据库（Neon 法兰克福）；删除账号时删。
  - **注册时间、邀请码批次、登录会话**：同上。
  - **匿名 ID**：从账号算出来，只用于统计人数；明细 35 天，之后只留汇总。
- 「邀请码」那一行改成：只在注册时用一次；数据库只存邀请码的哈希和批次名称。
- 「我们不做的事」里删掉「没有账号」，改成「账号只用邮箱，不收集姓名、手机号」。
- 「第三方」加 **Resend**：发送验证码邮件，欧盟（爱尔兰）。
- 「你的权利」加：在 App 里删除账号；网页上的删除申请方式（见下面 Google 的要求）。

### `docs/release/privacy-labels.md`（交给发布核对）

- **Apple：**
  - 加 **Contact Info → Email Address**：关联到用户身份，用途 App Functionality。
  - 加 **Identifiers → User ID**：关联到用户身份，用途 App Functionality。
  - 「Usage Data → Product Interaction」要重新判断：人数统计用的是从账号算出的匿名 ID，可能要改成「关联到用户身份」。
  - Privacy manifest 加对应的几项。
  - 账号删除：苹果审核指南 5.1.1(v)，App 内要能发起删除。我们有。
- **Google Play：**
  - Data safety 加 **Personal info → Email address**：收集，不共享，必需，用途 Account management 和 App functionality。
  - 加 **App activity → App interactions** 或 **Device or other IDs** 里的用户 ID，按 Google 的定义核对。
  - 「Do you provide a way for users to request that their data is deleted?」选 **Yes**。
  - **Google 还要求一个网页上的删除入口**（不用装 App 也能申请删除）。我们可以先用隐私政策里的一节加邮箱 info@novawerk.io，正式上架前换成 novawerk.io 上的页面。请发布确认。
- **审核备注**（`review-notes.md`）：写明审核员登录方式（第 4 节），值只填在商店后台。

### 其他

- [admin.md](./admin.md)：D-A1 定为 F，第 1 节「用户数」和「邀请码算不算用户」按第 5 节改写；第 3 节邀请码管理只管注册准入。
- [onboarding.md](./onboarding.md)、[screens.md](./screens.md)：O3 去掉邀请码区块；P1 加账号区、去掉邀请码行；新增 L1–L3。
- [information-architecture.md](./information-architecture.md)：首次打开的流程加 L1–L3；「之后打开」在会话失效时回到 L1。
- [mvp-acceptance.md](../mvp-acceptance.md)：A1a（邀请码在引导里填）改写；新增 H 节「登录和账号」验收（见下）。
- `api-contract.md`：后端加登录、注册、退出、删除账号的接口；`/chat` 等接口改成带会话；旧版过渡期的处理。

---

## 7. 验收（建议加入 mvp-acceptance.md 的 H 节）

- **H1** 新用户：输邮箱 → 收到邮件（中英按界面语言）→ 输码 → 输邀请码 → 进首页。
- **H2** 老用户换手机：输邮箱 → 输码 → 直接进首页，不问邀请码。
- **H3** 码错了提示剩余次数；输错 5 次失效；过期提示重新发送；60 秒内不能重发，有倒计时。
- **H4** 没注册过的邮箱和注册过的邮箱，点「发送验证码」后看到的完全一样。
- **H5** 旧版用户更新后：登录一次，旧邀请码自动带上，不显示 L3；练习记录还在。
- **H6** 退出登录后，记录不删；换另一个邮箱登录看不到上一个人的记录；换回来又能看到。
- **H7** 删除账号：两步确认；勾选时本机记录一起清空；服务器上查不到这个邮箱；用同一个邮箱重新注册需要新的邀请码。
- **H8** 审核员邮箱加固定码能登录、不发邮件；别的邮箱用这个码登录失败；环境变量清空后这个邮箱也要正常收码。
- **H9** 统计表里只有匿名 ID，没有邮箱和账号 ID。

---

## 设计稿

登录相关的几屏在设计稿第 ⑦ 行（L1、L2、L3、「我的」账号区、删除账号）：<https://claude.ai/artifact/UkqiioLoNiSB618ks8dPvg>（内部链接，需要分享后才能打开）。**外观要用户在看板上确认后再做。**
