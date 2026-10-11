# 测试渠道：TestFlight 和 Play 内部测试

目标：2026-10-17/18 demo 前，聆镜团队能在自己手机上装到 App。

## 现在的状态

| 渠道 | 版本 | 状态 |
|------|------|------|
| Play 内部测试 | 0.1.0（versionCode 1） | 已推出。测试员名单「PSYGYM testers」，加入链接由发布转给用户 |
| TestFlight 外部组「聆镜团队」 | 0.1.0（Build 5） | 已提交 Beta App Review，排队中。过审后 Apple 会给组里的测试员发邀请邮件 |
| TestFlight 内部组「Novawerk internal」 | 0.1.0（Build 6–8，Xcode Cloud 自动打的） | 组里没有人，不会推给任何人 |

## 发 0.2.0（带登录）的顺序

0.2.0 起 App 要先登录（[login.md](../product/login.md)）。发行说明在 [release-notes.md](./release-notes.md)。

1. **版本号 PR 合并**（0.2.0 / versionCode 2）。
   - iOS：Xcode Cloud 自动打包，并上传到 TestFlight 内部组。这一步不推给任何人。
   - Android：发布在用户本机跑 `bundleRelease`，只上传到 Play 的 bundle 库，不推出。跑之前先和总控确认，避开别人在用的模拟器和 Gradle。
2. **服务器打开登录**（`AUTH_MODE=on`）。旧版继续能用邀请码。总控先用内部邮箱测一遍真实登录和收信。
3. **审核员登录信息**：总控生成审核员邮箱和验证码，直接交给用户，由用户或发布填进后台。不进仓库，见 [review-notes.md](./review-notes.md)。
4. **用户点头后**：
   - Play 内部测试推出 0.2.0。不用审核，测试员会自动更新。
   - iOS 0.2.0 的 build 加进「聆镜团队」，送 Beta App Review。新版本的第一个 build 要重新审，通常 1–2 天。
   - 隐私：合并 #85、#86；后台的隐私政策链接换成官网；按 [privacy-labels.md](./privacy-labels.md) 的登录版改 Play 数据安全表。Play 的「发送以供审核」等以后要上封闭测试或正式版时再点。
5. **两边旧版都被替换后**，服务器才切成必须登录。如果有测试员还在用 0.1.0（比如 Build 5 过审后装的），先让他们升级。

## iOS · TestFlight

**两种组：**

- **内部组「Novawerk internal」**：只能加 App Store Connect 里的用户，最多 100 人，不用审核。要加的人必须先成为 ASC 用户，这算改团队成员，要用户同意。Xcode Cloud 打的每个 build 都会自动进这个组。
- **外部组「聆镜团队」**：按邮箱邀请，也可以开公开链接，最多 10,000 人。**每个版本的第一个 build 要过 Beta App Review。** 聆镜团队用这个组。

**Test Information 是整个 App 共用的，不按 build 分。** 旧版还在审核时改登录信息，会影响旧版的审核。所以新旧两版同时在审的时候，Review Notes 里两种都写：0.1.x 用邀请码，0.2.x 用邮箱和验证码；Sign-in 栏填 0.2.x 的邮箱和码。旧版有结果后，再删掉 0.1.x 那段。

| 字段 | 内容 |
|------|------|
| Beta App Description | 照 release-notes.md 里当前版本的说明，去掉「这一版新增」 |
| What to Test（每个 build 单独填） | release-notes.md 里当前版本的「TestFlight · What to Test」 |
| Feedback Email | info@novawerk.io |
| Marketing URL | https://psygym.novawerk.io |
| Privacy Policy URL | 0.2.0 送审起：https://psygym.novawerk.io/en/privacy 。之前用 GitHub 上的 privacy-policy.md |
| Beta App Review 联系人 | 名、姓、电话、邮箱：由用户给，只填在 ASC，不进仓库 |
| Sign-in required | 0.2.0 起：勾选。User name 填审核员邮箱，Password 填验证码。之前：不勾，在 Review Notes 里给邀请码 |
| Review Notes | 见 [review-notes.md](./review-notes.md) |

## Android · Play 内部测试

- 最多 100 人，**不用审核**，推出后几分钟就能装。
- 测试员要有 Google 账号。名单「PSYGYM testers」在 Testers 里，是开发者账号共用的；同一个账号下还有一个旧的「Tester」名单，属于别的 App，不要动。
- Play 不会自动给测试员发邮件。加入链接要我们自己转。
- 用的是 Play App Signing：Google 保管应用签名密钥，我们只用上传密钥签名（见 [signing.md](./signing.md)）。
- App content 已经全部填好（登录前版）。0.2.0 起按登录版改，见 privacy-labels.md。
- 发行说明照 release-notes.md 贴，商店语言是 en-US 和 zh-CN 两种。
- 中国大陆的 Android 手机通常没有 Google Play，内部测试装不上。退一步可以从 Play Console 的「App bundle explorer」下载已签名的 APK 直接发。这算分发安装包，要用户同意。

## 每次要用户给或点头的

1. 测试员邮箱。iPhone 用 Apple ID 邮箱，Android 用 Google 账号邮箱。
2. 审核联系人的电话，审核员的邮箱和验证码：只填在后台。
3. 在用户本机打 Android 包并上传。
4. Play 推出新版本；iOS 送 Beta 审核；邀请测试员。
5. 切换隐私链接和申报。
