# Onboarding：第一次打开 App

**批次：🟢 第 1 批（demo 必经）。** O4 在第 3 批（D6 已定）。

**2026-10-17 改（用户定）：** 不再有单独的语言页。原来的 O3（只剩「界面语言」）整页去掉，O2 确认后直接进登录（L1）。界面语言默认跟随系统：系统语言以 zh 开头用中文，其他都用英文。O1、O2 和登录页右上角的「中 | EN」切换保留；「我的」（P1）里照样能改；已经选过语言的人保持原来的选择。O3 上「病例暂时只有中文……」那句说明挪到「我的 → 语言」下面一行小字。

**目标：** 30 秒内让用户知道三件事——这是练习工具、对话去了哪里、怎么开始。然后让他们尽快开始第一场练习。

**规则：**

- 两页（O1、O2），第 3 批加 O4。不再多。
- 顶部有页码点（● ○）。O1、O4 可以「跳过」；O2 不能跳过，必须点确认。
- 「跳过」= 跳到 O2（如果还没确认）或直接进首页。
- 右上角始终有语言切换（中 / EN），第一屏就能换。没有单独的语言页：默认跟随系统。
- 不申请任何系统权限。我们不需要通知、相册、麦克风、定位。
- 每页一个主按钮，在屏幕下方拇指能够到的位置。

---

## O1 · 欢迎

**布局：** 上半屏一张插画（咨询室里两把椅子，一把空着、一把上有一个柔和的光点，表示 AI 来访者）。下半屏标题、三步说明、主按钮。

| | 中文 | English |
|---|------|---------|
| 标题 | 和 AI 来访者练一场 | Practise with an AI client |
| 副标题 | 给新手咨询师的练习工具。 | A practice tool for new counselors. |
| 步骤 1 | **选一个病例。** 每位来访者都是虚构的。 | **Pick a case.** Every client is fictional. |
| 步骤 2 | **开始会谈。** AI 扮演来访者，像真人一样回应你。 | **Hold a session.** An AI plays the client and responds like a real person. |
| 步骤 3 | **看督导反馈。** 引用你的原话，告诉你哪里好、哪里可以改。 | **Get feedback.** It quotes your words: what went well, what to change. |
| 主按钮 | 继续 | Continue |
| 次按钮 | 跳过 | Skip |

---

## O2 · 先说清楚

**布局：** 顶部一个盾牌小图标和标题。中间五条（内容可滚动），每条一个小图标 + 一句粗体 + 一句解释。底部两个勾选框和主按钮。两个都勾选前主按钮是灰的。发给 AI 服务单独勾选，不和免责声明绑在一起（Apple 5.1.1(i)、5.1.2(i)，2026-10-30 审核要求）。

| | 中文 | English |
|---|------|---------|
| 标题 | 开始之前，先说清楚 | Before we start |
| 1 粗体 | 这不是心理治疗。 | This is not therapy. |
| 1 解释 | 这是给咨询师的练习工具，不给来访者用，不能在危机中提供帮助。如果你自己正在经历困难，请点下方「需要帮助？」。 | It's a practice tool for counselors. It's not for clients, and it can't help in a crisis. If you're going through a hard time yourself, tap "Need help?" below. |
| 2 粗体 | 来访者是虚构的。 | The clients are fictional. |
| 2 解释 | 由 AI 扮演。对话可能涉及抑郁、焦虑和消极念头。 | An AI plays them. Sessions may touch on depression, anxiety and dark thoughts. |
| 3 粗体 | 对话会发给 DeepSeek。 | Your conversation goes to DeepSeek. |
| 3 解释 | 为了生成来访者回复和督导反馈，我们会把你输入或说出的内容、之前的对话和界面语言，经我们的服务器发给第三方 AI 服务 DeepSeek（杭州深度求索人工智能基础技术研究有限公司，在中国）。我们不发你的邮箱和账号 ID，服务器也不保存对话。你在下方同意之后才会发送。 | To write the client's replies and your feedback, we send what you type or dictate, the conversation so far and your interface language through our server to DeepSeek, a third-party AI service run by Hangzhou DeepSeek Artificial Intelligence Co., Ltd. in China. We don't send your email or account ID, and our servers don't store the conversation. Nothing is sent unless you agree below. |
| 4 粗体 | 不要输入真实来访者的信息。 | Don't enter real client information. |
| 4 解释 | 姓名、经历、任何能认出一个人的细节都不要。 | No names, histories or any detail that could identify someone. |
| 5 粗体 | 督导反馈只供练习参考。 | The feedback is for practice only. |
| 5 解释 | 它由 AI 生成，不是资质评估，也不是临床意见。 | An AI writes it. It is not an assessment and not clinical advice. |
| 勾选框 | 我已了解，这是练习工具，不是治疗。 | I understand this is a practice tool, not therapy. |
| 勾选框 2 | 我同意把练习对话发给位于中国的 DeepSeek，用来生成回复和反馈。 | I agree that my practice conversations are sent to DeepSeek in China to write replies and feedback. |
| 主按钮 | 同意并继续 | Agree and continue |
| 链接 | 隐私说明（打开 P3） | Privacy (opens P3) |
| 链接 | 需要帮助？（打开 X1） | Need help? (opens X1) |

**规则：**

- 确认结果和声明版本号存本机（例：`disclaimerAccepted = 2026-10-v2`）。声明有实质改动时升版本号，用户下次打开重新看到 O2。
- 每次开始练习前，病例简介页（C2）再显示一次短版内容提示，不再要求勾选。这替代原来的练习前声明弹窗（D1，已定）。

---

## ~~O3 · 准备开始~~（2026-10-17 去掉）

以下只留作记录。邀请码在登录改版时挪到 L3（login.md），语言改成跟随系统。

**布局：** 标题，两个表单块，主按钮。

| | 中文 | English |
|---|------|---------|
| 标题 | 准备开始 | Almost ready |
| 语言块标题 | 界面语言 | Language |
| 语言选项 | 跟随系统 / 中文 / English | System / 中文 / English |
| 语言说明 | 病例暂时只有中文。界面是英文时，来访者和督导报告都用英文。 | Cases are written in Chinese for now. With the English interface, the client and the report are in English. |
| 邀请码块标题 | 邀请码 | Invite code |
| 邀请码说明 | 测试期间需要邀请码。没有的话可以先跳过。 | We need an invite code during testing. No code? Skip for now. |
| 输入框占位 | 输入邀请码 | Enter invite code |
| 主按钮 | 开始练习 | Start practising |
| 次按钮 | 先跳过 | Skip for now |

**规则：**

- 邀请码点「开始练习」时不联网校验（合同里没有校验接口）。第一次请求遇到 `invite_required` 时，再提示去设置改。
- 邀请码只存本机，在设置页（P1）能改。
- 「先跳过」后，没有邀请码的用户在发布版里会在第一次请求时看到邀请码提示；调试版走演示数据。

---

## O4 · 关于你（🟠 D6）

**目的：** 让首页推荐更合适的病例。**只存本机，不发给我们，也不发给后端**（D6，2026-10-10 定）。督导报告暂时不因人调整；等聆镜告诉我们不同经验的人该怎么督导，再议。

| 问题 | 选项（单选） |
|------|--------------|
| 你现在是 | 在读学生 / 刚开始执业（3 年内）/ 有经验的咨询师 / 督导或老师 / 其他 |
| 你对 CBT 熟悉吗 | 刚接触 / 学过，用得少 / 常用 |
| 最想练的是（多选，最多 3 个） | 建立关系 / 提问和倾听 / 识别自动思维 / 苏格拉底式提问 / 布置作业 / 风险评估 / 还不确定 |

主按钮「完成」，次按钮「跳过」。之后在「我的」里能改。

---

## 新增验收项（已加入 mvp-acceptance.md 的 G 节）

- **G1** 第一次打开 App，看到 O1；之后打开直接到首页。
- **G2** 引导不再有单独的语言页：界面语言默认跟随系统（系统语言以 zh 开头用中文，其他用英文）；O1、O2 右上角仍能切换中 / EN，切换后当前页文字马上变。「我的」里也能切换，已经选过语言的人保持原来的选择。
- **G3** O2 不勾选时「我知道了」不可点；O2 不能被跳过。
- **G4** 「我的」里「重新看引导」能从 O1 再走一遍，邀请码和语言不丢。
- **G5** 引导过程中不弹出任何系统权限请求。
