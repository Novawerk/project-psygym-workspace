# 测试渠道：TestFlight 和 Play 内部测试

目标：2026-10-17/18 demo 前，聆镜团队能在自己手机上装到 App。

## 时间线

| 日期 | 事 | 谁 |
|------|----|----|
| 10-10 | 两边建 App、TestFlight 内部组 | 发布（已做） |
| 10-11～13 | 移动端的签名和版本号 PR 合并；用户生成 Android 上传密钥；Xcode Cloud 建 workflow | 移动端、用户 |
| 10-13 | 第一个 iOS build 进 TestFlight；第一个 AAB 进 Play 内部测试 | 移动端出包，发布上传和配置 |
| **10-13～14** | **提交 TestFlight 外部测试的 Beta 审核**（通常 1 天内，有时 2 天） | 用户同意后由发布提交 |
| 10-14～15 | 加测试员、发链接（邮箱由用户给） | 用户同意后由发布来加 |
| 10-16 | 聆镜团队装好、跑一遍 demo 脚本 | 聆镜、我们 |

Beta 审核过了以后，同一个版本号下的新 build 一般不用重新审。demo 前最后一次修改，尽量只升 build 号，不升版本号。

## iOS · TestFlight

**两种组：**

- **内部组「Novawerk internal」**（已建）：只能加 App Store Connect 里的用户，最多 100 人，不用审核。适合我们自己人。要加的人必须先成为 ASC 用户，这算改团队成员，要用户同意。
- **外部组「聆镜团队」**（有第一个 build 后才能建）：可以按邮箱邀请，也可以开公开链接，最多 10,000 人。**每个版本的第一个 build 要过 Beta App Review。** 聆镜团队用这个组。

**外部测试要填的信息（Test Information）：**

| 字段 | 内容 |
|------|------|
| Beta App Description | 见下方「测试说明」 |
| Feedback Email | info@novawerk.io |
| Marketing URL | https://novawerk.io （可选） |
| Privacy Policy URL | https://github.com/Novawerk/project-psygym-workspace/blob/main/docs/release/privacy-policy.md （本 PR 合并后可用；以后换成 novawerk.io 上的页面） |
| Beta App Review 联系人 | 名、姓、电话、邮箱：由用户填。电话不进 git |
| Sign-in required | 否。但服务端要邀请码：在 Review Notes 里给审核员一个专用邀请码。邀请码由用户填在 ASC，不进 git |
| Review Notes | 见 [review-notes.md](./review-notes.md) |

**测试说明（Beta App Description / What to Test）**

> 聆镜 PSYGYM 是给新手心理咨询师的练习工具。AI 扮演来访者，练完由 AI 督导给一份反馈。来访者都是虚构的。这不是心理治疗，不给来访者用。
>
> 这一版请试：选一个病例 → 读病例简介 → 和来访者谈 5–10 轮 → 结束并看督导反馈。看看来访者像不像真人，反馈有没有用。问题和想法发到 info@novawerk.io。请不要输入真实来访者的信息。
>
> PSYGYM is a practice tool for new counselors. An AI plays the client; afterwards an AI supervisor gives feedback. Every client is fictional. This is not therapy and not for clients.
>
> Please try: pick a case → read the brief → talk with the client for 5–10 turns → end and read the feedback. Does the client feel real? Is the feedback useful? Send problems and ideas to info@novawerk.io. Please don't enter real client information.

## Android · Play 内部测试

- 最多 100 人，**不用审核**，上传后几分钟就能装。
- 测试员要有 Google 账号。我们在「Testers」里建一个邮件列表「聆镜团队」，填他们的 Google 账号邮箱，然后把 opt-in 链接发给他们。Play 不会自动给测试员发邮件，链接要我们自己转。
- 第一次上传 AAB 时确认 Play App Signing（见 [signing.md](./signing.md)）。
- 上传前，Play 会要求先填完几项 App content：隐私政策链接、App access（要邀请码，见 review-notes）、广告（无）、内容分级、目标受众、数据安全、健康类应用声明。草稿都在本目录里。内部测试允许部分项先空着，但正式版前必须填完。
- 中国大陆的 Android 手机通常没有 Google Play。聆镜团队里用国内安卓机的人，内部测试装不上。可以退一步：从 Play Console 的「Internal app sharing」或「App bundle explorer」下载已签名的 APK 直接发给他们。这还是要用户同意，因为是在分发安装包。

## 用户要给的

1. 外部测试员名单：iPhone 用户的邮箱，或者同意用公开链接。
2. Android 测试员的 Google 账号邮箱。
3. Beta 审核联系人的姓名和电话（只填在 ASC）。
4. 给审核员的邀请码（只填在 ASC 和 Play 的 App access）。
