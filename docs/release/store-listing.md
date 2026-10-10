# 商店文案（草稿）

规矩照 [copy.md](../product/copy.md)：短句，「我们」，现在时。不用「治疗、治愈、诊断、保证、最好的」，也不用 leverage / ecosystem / stakeholders / synergy / disrupt / transform。来访者不叫「病人」「患者」。商店文案里也说清楚：这是训练工具，不是治疗。

两边主语言都是 English（用户 2026-10-10 定），另加简体中文本地化。

## 名称

| 字段 | 限制 | 中文（zh-Hans） | English |
|------|------|------------------|---------|
| App 名称（Apple / Play） | 30 | 聆镜 PSYGYM | 聆镜 PSYGYM |
| 副标题（Apple） | 30 | 和 AI 来访者练咨询 | Practise with an AI client |
| 桌面图标名 | — | 聆镜 | PSYGYM |

英文名里留着「聆镜」，两边品牌一致。如果担心英文用户不会读，可以改成 `PSYGYM: Counselor Practice`（26 字符）。名称一旦提交审核，改起来就慢，建议在 Beta 审核前定。

## Apple

**Promotional Text（170，可以随时改，不用审）**

- 中：新手咨询师的练习场。AI 扮演来访者，练完 AI 督导引用你的原话给反馈。来访者都是虚构的，这不是心理治疗。
- EN: A practice room for new counselors. An AI plays the client; an AI supervisor quotes your words back with feedback. Every client is fictional. This is not therapy.

**Keywords（100，逗号分隔，不加空格）**

- 中：心理咨询,咨询师,练习,督导,CBT,认知行为,角色扮演,模拟来访者,心理学,培训,实习
- EN: counselor,counseling,practice,supervision,CBT,role play,psychology,training,trainee,mock client

**描述 · 中文**

> 聆镜 PSYGYM 是给新手心理咨询师的练习工具。
>
> 练习和督导都不好找。我们让你随时和 AI 来访者谈一场，谈完马上拿到一份督导反馈。
>
> **怎么练**
> · 选一个病例。每位来访者都是虚构的，有自己的背景和困扰。
> · 开始会谈。AI 扮演来访者，像真人一样回应你：会犹豫，会回避，也会被你的话打动或刺痛。
> · 看督导反馈。AI 督导引用你的原话，告诉你哪里做得好、哪里可以换个说法、下次练什么。
>
> **现在有什么**
> · CBT 取向，抑郁、抑郁伴焦虑等病例
> · 中英文界面；病例先有中文
> · 练习记录只存在你的手机上，可以随时删除
>
> **说在前面**
> · 这不是心理治疗，不给来访者用，不能在危机中提供帮助。
> · 来访者由 AI 扮演，全部是虚构的。对话可能涉及抑郁、焦虑和消极念头。
> · 对话会交给第三方 AI 模型服务处理。我们的服务器不保存对话。
> · 请不要输入真实来访者的信息。
> · 督导反馈由 AI 生成，只供练习参考，不是资质评估，也不是临床意见。
>
> 聆镜 PSYGYM 由聆镜团队和 Novawerk 一起做。代码和文档在 GitHub 公开，MIT 许可。

**Description · English**

> 聆镜 PSYGYM is a practice tool for new counselors.
>
> Practice and supervision are both hard to get. We let you hold a session with an AI client any time, and get supervision feedback right after.
>
> **How it works**
> · Pick a case. Every client is fictional, with their own story and struggles.
> · Hold a session. An AI plays the client and responds like a real person: they hesitate, they dodge, and they react to what you say.
> · Get feedback. An AI supervisor quotes your words back: what went well, what to say differently, what to practise next.
>
> **What's in it now**
> · CBT, with cases on depression and depression with anxiety
> · Chinese and English interface; cases in Chinese first
> · Practice history stays on your phone, and you can delete it any time
>
> **Before you start**
> · This is not therapy. It's not for clients, and it can't help in a crisis.
> · An AI plays every client. All clients are fictional. Sessions may touch on depression, anxiety and dark thoughts.
> · A third-party AI model service processes the conversation. Our servers don't store it.
> · Please don't enter real client information.
> · The feedback is AI-generated, for practice only. It is not an assessment and not clinical advice.
>
> 聆镜 PSYGYM is made by the 聆镜 (Lingjing) team and Novawerk. The code and docs are open on GitHub under the MIT licence.

**其他字段**

| 字段 | 值 |
|------|----|
| Category | Primary: **Education**（和 `project.pbxproj` 里的 `public.app-category.education` 一致）；Secondary: 不选。**不选 Health & Fitness** |
| Support URL | https://github.com/Novawerk/project-psygym-workspace/issues |
| Marketing URL | https://novawerk.io |
| Privacy Policy URL | 见 [testing.md](./testing.md) |
| Copyright | 2026 Novawerk（以上架主体为准） |
| Price | Free |
| Availability | 先不选中国大陆（见 [china-mainland.md](./china-mainland.md)） |

## Google Play

| 字段 | 限制 | 中文 | English |
|------|------|------|---------|
| Short description | 80 | 新手咨询师的练习工具：和 AI 来访者谈一场，马上拿到督导反馈。不是治疗。 | Practice for new counselors: talk with an AI client, then get supervision feedback. Not therapy. |
| Full description | 4000 | 同 Apple 中文描述 | 同 Apple English description |
| App category | — | Education | Education |
| Tags | — | Education、Psychology（以 Play 当时可选的为准） | |
| Contact email | — | info@novawerk.io | |
| Website | — | https://novawerk.io | |

## 截图要求（先记下，demo 后再拍）

- iPhone 6.9 英寸（1320×2868 或 1290×2796）至少 3 张；Play 手机截图至少 2 张，外加 1024×500 的 feature graphic。
- 建议 5 张：首页（带「这不是心理治疗」短版声明）→ 病例简介 → 会谈 → 督导反馈 → 「需要帮助？」页。
- 截图里只放虚构病例，不放真人照片。不在截图上写「治疗」「疗效」。
