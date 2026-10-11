# iOS 补测：错误状态和主流程 — 2026-10-11

补的是 [`ux-audit-2026-10-11.md`](../product/ux-audit-2026-10-11.md) 没测到的几块。

**结论：** 6 项全部通过。🔴 0 条 · 🟠 0 条 · ⚪ 3 条。

## 怎么跑的

- **设备：** iOS 模拟器 iPhone 17（iOS 26.5），main 的 Debug 包（commit 37434b0）。用 `xcodebuild` 编译，`CODE_SIGNING_ALLOWED=NO`。
- **后端：** 本机 8788 端口，不花模型额度。8787 是别人的进程，没碰。
  - 第 1 项：`apps/api`，`LLM_PROVIDER=mock`，`INVITE_CODES` 设一个码。
  - 第 2–6 项：`tests/contract/scripts/reference-server.mjs`，用 `FAULT=<name>` 让每次请求按指定方式出错；不设 `FAULT` 时正常回复。
- **App 指向 8788：** 在本机 `apps/mobile/gradle.properties` 加了 `psygym.apiBaseUrl=http://localhost:8788`，没提交。「我的 → 开发者」关掉演示数据。
- **界面语言：** 英文（模拟器系统语言），浅色。参考服务器的病例和回复是固定的中文示例文本，所以英文界面里会看到中文气泡，这不是 App 的问题。
- **截图：** 在本机 `test-results/2026-10-11/IOS-*.png`，不进仓库，都是 mock 数据。

**严重度**沿用 ux-audit：🔴 挡 demo · 🟠 影响体验 · ⚪ 小瑕疵。

---

## 结果

| # | 项目 | 结果 |
|---|------|------|
| 1 | 输错邀请码 | ✅ |
| 2 | 限流（429） | ✅ |
| 3 | 模型不可用 | ✅ |
| 4 | 超时 | ✅ |
| 5 | 流式输出中途出错 | ✅ |
| 6 | 主流程：首页 → 简介 → 会谈 → 报告 → 记录 | ✅ |

### 1. 输错邀请码

- **首页：** 引导页填 `wrongcode`（服务器只认另一个码）。到首页后，病例列表位置出现「You need a valid invite code.」，下面是「Open Settings」「Try again」。点 Open Settings 进设置，改成服务器认的码，保存，返回：病例列表正常加载。
- **会谈中：** 聊了一轮后，把服务器的码换掉，再发一句。消息下面出现同样的错误卡，之前的对话都还在。点 Open Settings → 改码 → 保存 → 返回，**回到原来那场会谈**，点 Try again，来访者正常回复。（`IOS-T1-chat-retry-ok.png`）

### 2. 限流（429）

- 发一句后出现「Too many requests. Try again in 30 seconds.」。Try again 按钮带倒计时「Try again (27)」，倒计时结束前点不了，和 `Retry-After: 30` 一致。（`IOS-T2-429.png`）
- 去掉 FAULT，等倒计时结束后点 Try again，回复正常出来。

### 3. 模型不可用

- 「The AI is unavailable right now. Try again in a few minutes.」+ Try again。已有对话不丢。（`IOS-T3-model-unavailable.png`）

### 4. 超时

- 服务器发完 `turn_start` 和一个 `: ping` 后就不再发。
- 发出后约 27 秒，屏幕上还是「…」等待气泡，输入框和发送按钮都不可用。（`IOS-T4-hang-25s.png`）
- 约 37 秒时已经显示「No response for too long. Try again.」+ Try again。（`IOS-T4-hang-37s.png`）
- 超时落在 27–37 秒之间，和 30 秒的规定一致。（我是隔一段时间截一次图，没法精确到秒；Android 上之前测到的是约 34 秒，含轮询误差。）

### 5. 流式输出中途出错

- 服务器先发半句，再发 `error` 帧。来访者气泡保留半句「嗯……最近总是睡」，后面标「(incomplete)」，下面是「The AI is unavailable right now…」+ Try again。（`IOS-T5-stream-error.png`）
- 去掉 FAULT 后点 Try again：未完成的那个气泡被**替换**成完整回复，没有重复。（`IOS-T5-retry.png`）

### 6. 主流程

- **首页：** 病例卡、Pick a client、安全说明、底栏都正常。
- **简介页：** 来访者 / 这次练什么 / 会谈设置 / 内容提示 / Start session / Need help?。
- **会谈：** 发消息、回复逐步显示、轮次和计时都正常。点 End 弹出结束弹层，有保存告知「The session and report are saved on this phone…」。
- **报告：** 三个标题和 C7 声明都在；底部有 Practise this case again / Try another case / Back to home。
- **离开报告页：** 点 Back to home 直接回首页。保存打开时**不再**弹「报告就没有了」（#49 修好了）。
- **记录：** 「Today」下面有这一场（时间、时长、轮数、「Next: …」）。点开有 Report / Conversation 两个标签和删除按钮。（`IOS-T6-report.png`、`IOS-T6-history-detail.png`）

---

## ⚪ 小瑕疵

### a. 失败的那一轮也计入轮次

- **在哪：** 会谈页标题下的「Turn N」。
- **怎么复现：** 发一句，让后端返回任何错误（例如 401）。
- **现象：** 消息没有得到回复，但「Turn 1」已经变成「Turn 2」；重试成功后仍是 2。计数看起来是按「发出去的句子」算，而不是按「完成的一轮」算。
- **建议：** 如果「轮」的意思是一问一答，只在收到回复后再加一。影响很小。

### b. 出错后直接发新的一句，前一句会一直没有回复

- **在哪：** 会谈页，有错误卡的时候。
- **怎么复现：** 让一句发送失败（例如超时），不点 Try again，直接在输入框打下一句发出。
- **现象：** 错误卡消失，新的一句得到回复；前一句留在对话里，下面没有回复，也没有任何标记。合同允许连续两句咨询师的话，所以不算错，但看起来像漏了一条。（`IOS-edge-new-msg-after-error.png`）
- **建议：** 给失败的那句加一个淡色的「未发送 / 未回复」标记；或者错误卡还在时，让发送新消息等同于先重试。可以等 demo 后再做。

### c. 邀请码输入框点击后光标位置不对（只在模拟器上看到）

- **在哪：** 我的 → Invite code 输入框。
- **现象：** 点输入框右侧时，光标有时跑到开头，新输入的字插在已有内容前面。输入框也没有一键清空按钮，要改码只能一个个删。
- **说明：** 可能是模拟器的点击方式造成的，真机上需要确认。建议在输入框右侧加一个清空按钮。

---

## 没测的

- **深色模式、中文界面：** 这次只测了英文浅色。Android 上 10/10 测过中英 × 深浅色。
- **断网：** iOS 模拟器用的是 Mac 的网络，没法单独给模拟器断网；断网的情况 ux-audit 已经在 Android 上测过。
- **真模型：** 按要求不花额度。
