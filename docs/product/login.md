# 登录和账号

**状态：规格（2026-10-11）。** 我们定了：App 要有账号（D-A1 = F），在 demo（10/17）前做完。这份写清楚流程、页面、文案、规则和要改的隐私文档。接口以 [`api-contract.md`](../api-contract.md) 的「Sign-in」一节和 [ADR 0008](../decisions/0008-sign-in.md) 为准（后端 #64），这里写产品要求；两边不一致时先对齐，再改代码。

## 已定

- **只有邮件验证码一种登录方式。** 国内也能用。不做 Google 登录，所以苹果也不要求「通过 Apple 登录」。
- **App 里能删除账号。** 苹果硬性要求，Google Play 也要求，Google 还要一个网页上的删除入口（第 6 节）。
- **练习记录还是只存在手机上。** 服务器照旧不存对话。
- **服务器只存：** 邮箱、注册时间、来自哪个邀请码批次、登录会话。另外，统计活跃人数用每天、每周轮换的**假名**（第 5 节），不存邮箱，也不存账号 ID。

---

## 1. 流程

### 新用户

```
O1 欢迎 → O2 先说清楚（勾选同意）→ O3 准备开始（只选语言）
  → L1 输入邮箱 → L2 输入验证码 →（新邮箱）L3 输入邀请码 → H1 首页
```

- **邀请码只在注册时输一次**，用来控制谁能进。之后每次请求靠登录会话，不再带邀请码。
- **邀请码放在验证码之后：** 先确认邮箱是用户本人的，再要邀请码；老用户输完验证码直接进首页。
- **L2 → L3 不发半截会话：**
  - L2 用验证码登录时，新邮箱会收到「需要邀请码」。这时**验证码不作废**，也不算输错一次。
  - App 显示 L3。用户输入邀请码后，App 用**同一个验证码**加邀请码再提交一次；对了才建账号、发会话。
  - 所以在输完邀请码之前，用户手里没有任何会话，什么接口都调不了；服务器也不存「没完成注册的邮箱」。
  - 邀请码输错算进这个验证码的 5 次尝试里，这就是 L3 的限流。用完 5 次，回到 L2 重新发码。
  - 验证码 10 分钟过期，L3 停留太久也要重新发码。
- O3 原来的「邀请码」区块去掉，O3 只剩语言；底部只留一个「继续」（`onb_ready_continue`：继续 / Continue），去掉「先跳过」。

### 老用户（已有账号）

- 换手机、重装、退出后再登：L1 → L2 → H1。
- 登录会话 **90 天，每次使用自动续期**；连续 90 天没用过，下次请求提示「登录已过期，请重新登录」，回到 L1。正在进行的会谈不丢（见第 2 节「其他错误」）。

### 已经在用旧版（没有登录）的人怎么迁移

旧版只在手机上存了邀请码。更新到带登录的版本后：

1. 打开 App，已经勾选过 O2 的人不再看引导，直接到 L1。L1 上方加一行说明：「现在需要用邮箱登录。练习记录还在这台手机上。」
2. 新版第一次提交验证码时，就把手机上存着的旧邀请码一起带上。是新邮箱、旧码也有效，就直接建账号，**不显示 L3**；旧码已经作废时，才显示 L3 让用户重新输。
3. 手机上原有的练习记录，归到这个账号名下（见第 2 节「退出登录」）。
4. **App 不设过渡期，服务器分三步切换（2026-10-11 定，和后端 #80 一致）：** 新版 App 一直走登录，不看服务器的开关，也不会在「邀请码」和「登录」之间切换。服务器这边按这个顺序：
   1. **新版提交审核时：** 打开登录（可选登录模式），设好审核员的登录信息（第 4 节）。旧的邀请码保留，所以旧版和正在审核的旧 Build 照常能用。
   2. **新版过审、两边商店里的旧版都被替换掉以后：** 切成「必须登录」，删掉旧的邀请码。从这时起，不带会话的请求回 `426 update_required`。
   3. **审核一结束：** 清掉审核员的登录信息。
   - 不能提前切「必须登录」：一切换，只带邀请码的请求全部回 426，旧版和正在审核的旧 Build（例如 TestFlight 的 Build 5、Play 内测版）都会被挡在外面。
   - **新版**永远带会话，万一收到 426，和 `sign_in_required` 一样处理，回到登录页；**旧版**收到 426 只会显示它自己的通用错误，我们直接通知两位测试员更新。

### 审核员

见第 4 节。

---

## 2. 页面、布局和文案

沿用现有的 zinc 配色和组件：白底，zinc-950 文字，zinc-100 浅灰卡片，zinc-900 黑底白字主按钮，圆角卡片 12、按钮和输入框 8。设计稿里有 L1、L2、L3、「我的」账号区和删除账号（见文末），**外观要用户在看板上确认后再做**。

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
│ [ ][ ][ ][ ][ ][ ]          │  ← 看起来是 6 个格子，其实是一个输入框
│                            │
│ （错误提示）                   │
│                            │
│ 没收到？检查一下垃圾邮件。         │
│ 重新发送（45 秒）               │  ← 倒计时结束后变成可点的链接
│                            │
│ [          登录          ]   │  ← 输满 6 位自动提交；按钮作为备用
└────────────────────────────┘
```

**输入和读屏：**

- 6 个格子在实现上是**一个**数字输入框，读屏读作「验证码，6 位数字」，不是 6 个输入框。
- iOS：输入框设 `textContentType = oneTimeCode`，系统能从邮件里提示填入。
- Android：至少保证能整段粘贴（粘贴 6 位数字自动填满）。能用系统的一次性验证码自动填充更好，不强求。
- 粘贴或自动填充时，去掉空格和非数字字符。

| key | 中文 | English |
|-----|------|---------|
| login_code_title | 输入验证码 | Enter the code |
| login_code_field_cd | 验证码，6 位数字（读屏） | Code, 6 digits (screen reader) |
| login_code_sent_to | 已发送到 %1$s | Sent to %1$s |
| login_code_change_email | 改邮箱 | Change email |
| login_code_submit | 登录 | Sign in |
| login_code_not_received | 没收到？检查一下垃圾邮件。 | Didn't get it? Check your spam folder. |
| login_code_resend | 重新发送 | Send again |
| login_code_resend_in | 重新发送（%1$d 秒） | Send again (%1$d s) |
| login_code_resent | 新的验证码已发送。 | We sent a new code. |
| login_code_invalid | 验证码不对或已失效。可以重新输入，或者重新发送一个。 | That code is wrong or no longer works. Try again, or send a new one. |
| login_code_used_up | 这个验证码已经试了 5 次，请重新发送一个。 | You've tried this code 5 times. Send a new one. |

服务器对「输错、过期、用过、输错 5 次」只回一个错误（`invalid_code`），所以 App 只显示这一句，不显示「还能试几次」。

**App 自己计数：** App 记住当前这个验证码连续收到了几次 `invalid_code`（L3 收到的 `invite_invalid` 也算一次）。满 5 次以后，这个码在服务器上已经失效：App 不再允许提交，输入框旁只留「重新发送」，提示改成 `login_code_used_up`。重新发送后计数清零。L3 的「次数用完」也按这个计数判断。

**邮件发不出去时：** 「发送验证码」总是立即成功，邮件在之后才发，所以发信失败时 App 收不到任何错误。用户没收到邮件，就点「重新发送」，L2 上「没收到？检查一下垃圾邮件。」这一行就是为此准备的。

### L3 输入邀请码（只有新邮箱）

**邀请码的格式：** 注册用的邀请码至少 12 位随机字符，只用不易混的字母和数字（去掉 0/O、1/I/L）。显示和发给用户时分成 3 段（例如 `k7mp-x2qr-9wtd`）。输入时不区分大小写，短横线和空格可输可不输，App 提交前统一去掉短横线和空格、转小写。

**布局：**

```
┌────────────────────────────┐
│                            │
│ 还差一步                     │
│ 测试期间需要邀请码。邀请码由聆镜团队  │
│ 发放。                       │
│                            │
│ ┌────────────────────────┐ │
│ │ xxxx-xxxx-xxxx           │ │  ← 不区分大小写，短横线可输可不输
│ └────────────────────────┘ │
│ 12 位，不区分大小写；短横线可输可不输。 │
│ （错误提示）                   │
│                            │
│ [        完成注册          ]   │
│ 没有邀请码？返回               │  ← 文字链接，回到 L1
└────────────────────────────┘
```

| key | 中文 | English |
|-----|------|---------|
| login_invite_title | 还差一步 | One more step |
| login_invite_body | 测试期间需要邀请码。邀请码由聆镜团队发放。 | We need an invite code during testing. The 聆镜 (Lingjing) team hands them out. |
| login_invite_hint | xxxx-xxxx-xxxx | xxxx-xxxx-xxxx |
| login_invite_format | 12 位，不区分大小写；短横线可输可不输。 | 12 characters, not case-sensitive. Dashes are optional. |
| login_invite_submit | 完成注册 | Finish signing up |
| login_invite_invalid | 这个邀请码不对，或者已经作废了。（服务器回 `403 invite_invalid`） | This invite code isn't valid or has been turned off. |
| login_invite_code_used_up | 尝试次数用完了，请回到上一步重新发送验证码。 | Too many tries. Go back and send a new code. |
| login_invite_none | 没有邀请码？返回 | No invite code? Go back |

### L1、L2、L3 没网时

- 按钮按下后没网：按钮下面显示通用的网络错误（`error_network`：连不上服务器，请检查网络后重试。），已经输入的邮箱、验证码、邀请码都保留，按钮恢复可点。
- L2 的重发倒计时不受影响；重发时没网，同样显示这句，不开始新的倒计时。

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
| logout_body | 这台手机上的练习记录不会删除，下次用同一个邮箱登录时会显示。记录没有加密，别人用这台手机登录时列表里不显示，但它们仍在手机上；不想留，请先在「我的」里删除。 | Your practice history isn't deleted. It shows again when you sign in with the same email. It isn't encrypted: when someone else signs in on this phone it's hidden from the list, but it's still on the phone. If you don't want to keep it, delete it under Me first. |
| logout_confirm | 退出登录 | Sign out |
| logout_cancel | 取消 | Cancel |

- **练习记录跟账号走：** 本机记录存的时候带上账号 ID。退出后记录不删，只是按账号过滤显示。这**不是保护**：记录没有加密，文案里不说「别人看不到」。
- 退出时服务器作废这个会话；手机上的会话 token 一起删。

### 删除账号（两步）

删除账号时，**这台手机上属于这个账号的练习记录一定一起删除**。不给选择：删掉的账号再也登录不回来，用同一个邮箱重新注册会是一个新账号，旧记录会变成谁也看不到的数据，留着没有意义。

**第一步：说明页（全屏）**

```
┌────────────────────────────┐
│ ← 返回                       │
│ 删除账号                      │
│                            │
│ 删除后：                      │
│ · 我们服务器上的邮箱、注册时间、     │
│   邀请码批次和登录会话，马上删除。   │
│ · 这台手机上这个账号的练习记录，     │
│   一起删除。                   │
│ · 统计里已经汇总的数字不受影响，     │
│   它们不带账号。               │
│ · 你以前发出的报告评价和举报在       │
│   我们的 Slack 频道里，不带账号和   │
│   邮箱，我们认不出哪些是你的，      │
│   所以没法按账号删除。            │
│                            │
│ 删除后不能恢复。之后可以用同一个邮箱  │
│ 重新注册，但需要新的邀请码。        │
│                            │
│ [        继续删除          ]   │  ← 红色主按钮
└────────────────────────────┘
```

**第二步：确认弹窗**，要求输入邮箱前 3 个字符，防止误点。

| key | 中文 | English |
|-----|------|---------|
| delete_title | 删除账号 | Delete account |
| delete_after | 删除后： | After you delete: |
| delete_server | 我们服务器上的邮箱、注册时间、邀请码批次和登录会话，马上删除。 | We delete your email, sign-up date, invite batch and sessions from our server right away. |
| delete_local | 这台手机上这个账号的练习记录，一起删除。 | Practice history for this account on this phone is deleted too. |
| delete_stats | 统计里已经汇总的数字不受影响，它们不带账号。 | Totals already counted stay. They don't carry your account. |
| delete_slack | 你以前发出的报告评价和举报在我们的 Slack 频道里，不带账号和邮箱，我们认不出哪些是你的，所以没法按账号删除。 | Ratings and reports you sent earlier are in our Slack channel without your account or email. We can't tell which are yours, so we can't delete them by account. |
| delete_irreversible | 删除后不能恢复。之后可以用同一个邮箱重新注册，但需要新的邀请码。 | This can't be undone. You can sign up again with the same email, but you'll need a new invite code. |
| delete_continue | 继续删除 | Continue |
| delete_confirm_title | 确定删除账号？ | Delete your account? |
| delete_confirm_body | 输入 %1$s 的前 3 个字符确认。 | Type the first 3 characters of %1$s to confirm. |
| delete_confirm_action | 删除 | Delete |
| delete_done | 账号已删除。 | Your account has been deleted. |

- 删除成功后，App 删掉会话 token 和这个账号的本机记录，回到 L1，提示「账号已删除。」。
- 断网时不能删除，提示网络错误，什么都不清。

### 其他错误

| 情况 | 中文 | English |
|------|------|---------|
| 会话过期、被退出，或账号在另一台手机上被删除（服务器都回 `session_expired`） | 登录已过期，请重新登录。 | Your session has expired. Please sign in again. |
| 需要登录但没有会话（`sign_in_required`） | 请先登录。 | Please sign in first. |

会话失效时，正在进行的会谈不丢：先存本机，提示重新登录，登录后回到原来的页面。

旧版 App 在服务器开启「必须登录」以后，会收到 `426 update_required`，只能显示它自己的通用错误；新版收到 426 时和 `sign_in_required` 一样回到登录页，不需要「请更新」的文案。

### 会话 token 存在哪

- iOS：Keychain。
- Android：EncryptedSharedPreferences（或 Keystore 加密后再存）。
- 不放进普通的偏好设置，不写日志，不进备份。

---

## 3. 验证码规则

| 规则 | 值 |
|------|----|
| 长度 | 6 位数字 |
| 有效期 | 10 分钟 |
| 尝试上限 | 同一个码最多试 5 次（输错验证码和输错邀请码都算），用完就失效，要重新发送 |
| 重发间隔 | 60 秒 |
| 发送上限 | 同一个邮箱每小时最多 5 次；同一个 IP 每小时最多 20 次 |
| 一次一个码 | 重新发送后，旧码立即失效 |
| 存法 | 服务器只存验证码的 HMAC（带服务器密钥），不是直接哈希：6 位数字直接哈希，数据库泄露后很容易被穷举 |
| 不暴露邮箱是否注册 | 「发送验证码」不管邮箱有没有注册，都立即返回同样的结果；邮件**在返回之后异步发送**，响应时间也看不出差别 |
| 邮箱处理 | 去掉首尾空格、转小写后再用 |

### 验证码邮件

发件服务用 Resend，发件地址 `no-reply@novawerk.io`。邮件按 App 当前的界面语言发；纯文字为主，不放图片和追踪像素，不放可点的登录链接（防钓鱼）。

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

- **一个固定的审核员邮箱，加一个固定验证码。** 都放在后端环境变量里（`REVIEW_LOGIN_EMAIL`、`REVIEW_LOGIN_CODE`），不进仓库，不写进任何公开文档。
- **只对这一个邮箱有效。** 这个邮箱点「发送验证码」时，服务器不发邮件；输入固定码就能登录。别的邮箱输这个码一律无效。
- **不会被别人锁住：** 别人可能对审核员邮箱反复输错码，或者把发送次数用光，让审核失败。所以：
  - 审核员邮箱的固定码**不受 5 次尝试上限影响**，审核期间一直有效；
  - 不受按邮箱的发送上限影响（反正不发邮件）；
  - **按 IP 的限流保留**。
- **不用邀请码：** 这个账号归到批次 `review`，登录后直接进首页。审核员也可以测试删除账号，删了下次登录会重新建一个。
- **能随时关：** 不在审核期时清空这两个变量，这条路就不存在了。每次提交审核前换一个新码。
- **给审核员的说明：** 邮箱和码只填在两边商店后台的「审核备注 / 登录信息」里；`docs/release/review-notes.md` 里写怎么填，不写值。
- **统计：** 审核员账号的活动不计入活跃人数。

---

## 5. 统计：按账号算活跃人数

[admin.md](./admin.md) 里按天的计数照旧（不带任何 ID）。登录以后再加「活跃人数」：

- **假名，不是匿名：** 服务器用密钥从账号 ID 算出一个值（HMAC），持有密钥就能为某个账号重新算出来。所以文档和隐私政策里叫它「假名」，不叫「匿名」。
- **日活：** 每天一个密钥（从总密钥和日期算出），当天发过 `/chat` 或 `/supervision` 的账号记一行「当天的假名」。第二天汇总成一个数字，删掉明细。不同天的假名对不上，没法把一个人的几天连起来。
- **周活：** 同样的做法，按 ISO 周（周一到周日，不是滚动 7 天）换密钥，一周一张表，周结束汇总成数字后删掉明细。
- **不存：** 统计表里没有邮箱、没有账号 ID、没有邀请码批次。按病例、按语言的活跃人数先不做（要更多明细）。
- **展示阈值照旧：** 小于 5 显示「<5」，并防反推。
- **删除账号时：** 把当天和本周能算出来的那两行假名一起删掉。已经汇总的数字不动。
- **审核员账号不计入。**
- 原来按邀请码统计用量的设计（D-A1 选项 B）不再需要。

---

## 6. 要改的隐私和其他文档

登录上线（demo 前）时，下面这些要一起改。

### 和 main 上现有说法冲突的地方（本 PR 和后端 #64 一起改）

- `docs/safety.md` §1「只统计匿名次数……不存任何能认出用户的信息」：登录以后不再完全成立（有假名的活跃记录）。**本 PR 已改**成：

  > - **只统计次数，活跃人数用假名。** 服务端按天、按病例和界面语言统计次数和时长，只存数字，不存对话；登录以后，另外用每天、每周轮换的假名统计活跃人数，明细第二天或周末就汇总后删掉，不存邮箱和账号 ID。后台和统计接口显示时，小于 5 的数字只显示「<5」，并防止用合计反推。

  并加一条：

  > - **账号只存最少的信息。** 用邮件验证码登录。服务器只存邮箱、注册时间、邀请码批次和登录会话，不存对话。用户在 App 里能删除账号，删除后这些马上删掉。

- `docs/api-contract.md` 的 Basics「anonymous counts … no id of any kind」，以及 [ADR 0007](../decisions/0007-anonymous-counts.md) 里同样的话：由后端在 #64 改，ADR 0008 写明取代 0007 的这一条。
- 合同里原来的 `401 invite_required`：换成 `sign_in_required`、`session_expired`，开启「必须登录」以后不带会话的请求是 `426 update_required`（服务端代码不变）；邀请码只在 `/auth/verify` 里用（`403 invite_required`、`403 invite_invalid`），见 #64。App 不根据服务器的开关决定要不要登录。

### App 隐私说明（`copy.md` 和 `screens.md` P3）

- `privacy_a_collect` 现在写的是「没有账号」，改成：
  > 你的邮箱（用来登录）、注册时间、你注册时用的邀请码批次，和登录会话。你选的界面语言每次请求会带上。不收集姓名、手机号、位置。
- `privacy_a_stats` 改成：
  > 我们在服务器上按天统计次数，按病例和界面语言分开（开始了几场、来访者主动结束了几场、写了几份报告、每场几轮、一场多长、出了几次错、收到几次 👍/👎 和举报）。活跃人数用每天、每周轮换的假名统计，不用邮箱，明细很快就汇总后删掉。不含对话。
- 新增两问：

| key | 中文 | English |
|-----|------|---------|
| privacy_q_account | 账号存了什么？ | What does my account store? |
| privacy_a_account | 只有邮箱、注册时间、注册时用的邀请码批次和登录会话。练习对话和报告不在服务器上，只在你手机上。 | Only your email, sign-up date, the invite batch you used and your sessions. Practice conversations and reports aren't on our server, only on your phone. |
| privacy_q_delete | 怎么删除账号？ | How do I delete my account? |
| privacy_a_delete | 在「我的」→「删除账号」。删除后，服务器上的账号信息马上删掉，这台手机上这个账号的练习记录也一起删掉。不方便用 App 时，也可以按 novawerk.io/psygym/delete-account 上的说明申请。 | Go to Me → Delete account. We delete your account data from our server right away, and this account's practice history on this phone too. If you can't use the app, follow the steps at novawerk.io/psygym/delete-account. |

### `docs/release/privacy-policy.md`（中英）

- 「我们处理哪些数据」加：
  - **邮箱**：用来发验证码和登录；存在我们的数据库（Neon 法兰克福）；删除账号时删。
  - **注册时间、邀请码批次、登录会话**：同上；会话 90 天没用就失效，每次使用自动续期。
  - **假名的使用数据**：从账号算出的、每天和每周轮换的假名，只用来统计活跃人数；明细第二天（日活）或周末（周活）汇总后删除。
- 「邀请码」那一行改成：只在注册时用一次；数据库只存批次名称，不存邀请码本身。（以后台实现为准，见 [ADR 0008](../decisions/0008-sign-in.md)。）
- 「使用统计」那一行里「不存……任何能认出你的信息」改成：「按天的次数不带任何 ID；活跃人数用假名，见上一行。」
- 「我们不做的事」里删掉「没有账号」，改成「账号只用邮箱，不收集姓名、手机号」。
- 「第三方」加 **Resend**：发送验证码邮件。**Resend 是美国公司**；我们用它在欧盟区发送，但作为美国公司，数据可能被传到美国或受美国法律管辖，属于数据出境，依据它的标准合同条款。它的发送日志（收件邮箱、发送时间）按 Resend 的政策保留，保留期**待核对**。
- 「你的权利」加：在 App 里删除账号；不方便用 App 时，按网页 `novawerk.io/psygym/delete-account` 上的说明申请。

### 网页上的删除入口（Google Play 要求）

- **地址：** `novawerk.io/psygym/delete-account`。由总控另派人在 `apps/web` 里做。
- **语言：** 英文（novawerk.io 只有英文），App 名写「PSYGYM」。
- **内容：**
  - 页面全英文，不出现中文，团队名写「the Lingjing team」。
  - This page explains how to delete a PSYGYM account (PSYGYM is a counseling practice app made by Novawerk and the Lingjing team).
  - 最快的办法：在 App 里 Me → Delete account。
  - 不能用 App 时：用注册邮箱发邮件到 info@novawerk.io，主题写「Delete my PSYGYM account」。我们人工处理，**30 天内删除**，删完回信确认。
  - 删除什么：邮箱、注册时间、邀请码批次、登录会话。不删什么：已经汇总的统计数字（不带账号）；Slack 里的反馈和举报（不带账号，认不出是谁的）。
  - 手机上的练习记录只在手机上，我们碰不到：卸载 App 就会删除。

### `docs/release/privacy-labels.md`（交给发布核对）

- **Apple：**
  - 加 **Contact Info → Email Address**：关联到用户身份，用途 App Functionality。
  - 加 **Identifiers → User ID**：关联到用户身份，用途 App Functionality。
  - **Usage Data → Product Interaction 定为「关联到用户身份」**：活跃人数的假名从账号算出来，用途 Analytics。
  - Privacy manifest 加对应的几项。
  - 账号删除：苹果审核指南 5.1.1(v)，App 内要能发起删除，我们有。
- **Google Play：**
  - Data safety 加 **Personal info → Email address**：收集，不共享，必需，用途 Account management、App functionality。
  - 加 **Personal info → User IDs**：账号 ID 和假名。
  - 「Do you provide a way for users to request that their data is deleted?」选 **Yes**，填上面的网页地址。
- **审核备注**（`review-notes.md`）：写明审核员登录方式（第 4 节），值只填在商店后台。

### 其他

- [admin.md](./admin.md)：D-A1 = F，本 PR 已改。
- [principles.md](./principles.md)：「不做账号」改成「账号只是一把钥匙」，本 PR 已改。
- [onboarding.md](./onboarding.md)、[screens.md](./screens.md)：O3 去掉邀请码区块；P1 加账号区、去掉邀请码行；新增 L1–L3。登录上线时改。
- [information-architecture.md](./information-architecture.md)：首次打开的流程加 L1–L3；会话失效时回到 L1。登录上线时改。
- [mvp-acceptance.md](../mvp-acceptance.md)：A1a 改写；新增 H 节（见下）。登录上线时改。

---

## 7. 验收（建议加入 mvp-acceptance.md 的 H 节）

- **H1** 新用户：输邮箱 → 收到邮件（中英按界面语言）→ 输码 → 输邀请码 → 进首页。只收到一封验证码邮件。
- **H2** 老用户换手机：输邮箱 → 输码 → 直接进首页，不问邀请码。
- **H3** 码错了、过期、用过都显示同一句提示；60 秒内不能重发，有倒计时。
- **H4** 没注册过的邮箱和注册过的邮箱，点「发送验证码」后看到的完全一样，响应快慢也一样。
- **H5** 旧版用户更新后：登录一次，旧邀请码自动带上，不显示 L3；练习记录还在。
- **H6** 退出登录后，记录不删；换另一个邮箱登录，列表里不显示上一个人的记录；换回来又能看到。
- **H7** 删除账号：两步确认；这个账号的本机记录被清空；服务器上查不到这个邮箱；用同一个邮箱重新注册需要新的邀请码。
- **H8** 审核员邮箱加固定码能登录、不发邮件；别人对审核员邮箱输错 10 次后，固定码仍然有效；别的邮箱用这个码登录失败；变量清空后这个邮箱要正常收码。
- **H9** 统计表里只有每天、每周轮换的假名和汇总数字，没有邮箱和账号 ID。
- **H10** L1、L2、L3 断网时显示网络错误，输入的内容不丢。
- **H11** 读屏：验证码区域读作一个输入框；iOS 能从邮件提示填入验证码；Android 能整段粘贴。
- **H12** 会话 token 不在普通偏好设置和日志里（iOS Keychain，Android 加密存储）。

---

## 设计稿

登录相关的几屏在设计稿第 ⑦ 行（L1、L2、L3、「我的」账号区、删除账号）：<https://claude.ai/artifact/UkqiioLoNiSB618ks8dPvg>（内部链接，需要分享后才能打开）。**外观要用户在看板上确认后再做。**
