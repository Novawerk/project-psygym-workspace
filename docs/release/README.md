# 发布

我们怎么把聆镜 PSYGYM 发到测试渠道，以及以后怎么正式上架。这里都是草稿：没有提交任何审核。

## 现在的状态（2026-10-10）

| 渠道 | 账号 | 状态 |
|------|------|------|
| App Store Connect | 个人账号，Team ID `9VLTG4HRL9` | App「聆镜 PSYGYM」已建（主语言 English (U.S.)，SKU `psygym`，Limited Access）。Bundle ID `io.novawerk.psygym` 已注册，没开任何 capability。TestFlight 内部组「Novawerk internal」已建，0 人、0 个 build。 |
| Google Play Console | 个人账号 | App「聆镜 PSYGYM」已建，包名 `io.novawerk.psygym`，免费，默认语言 en-US，开了 Play 自动保护。内部测试轨道还没激活：没有 build，没有测试员。 |

不碰的：同一个 Google 账号下其他开发者账号里的 App；柏林中餐地图、YIMA 的任何设置。

## 文件

- [testing.md](./testing.md)：TestFlight 和 Play 内部测试怎么配，测试说明，demo 前的时间线。
- [signing.md](./signing.md)：签名密钥放哪、谁做什么。
- [store-listing.md](./store-listing.md)：商店文案，中英。
- [privacy-policy.md](./privacy-policy.md)：隐私政策正文，中英。TestFlight 外部测试和 Play 都要一个公开链接。
- [privacy-labels.md](./privacy-labels.md)：Apple App 隐私标签、Google 数据安全表的填写草稿。
- [content-rating.md](./content-rating.md)：Apple 年龄分级、Google IARC 问卷草稿。
- [review-notes.md](./review-notes.md)：心理健康类审核要注意的点，给审核员的说明。
- [china-mainland.md](./china-mainland.md)：如果要发到中国大陆，需要什么。只是调研结论。

## 定了的和还没定的

1. **上架主体：个人账号**（用户 2026-10-17 定）。App Store 和 Play 都用现在的个人开发者账号上架。
   - 风险：App Store 审核指南 5.1.1(ix) 说，医疗健康这类受监管领域的 App 应由法律实体提交。审核员可能按心理健康类看。我们在审核说明里写清楚：这是给咨询师的训练工具，不是医疗服务，见 [review-notes.md](./review-notes.md)。
   - 如果因为 5.1.1(ix) 被拒：改用 Novawerk 或聆镜的组织账号。组织账号要 D-U-N-S 编号，申请要几周，App 要转移到新账号。
2. **Play 个人账号的封闭测试要求。** 2023 年 11 月以后新建的个人账号，上正式版前要先跑封闭测试：至少 12 个测试员，连续 14 天。内部测试不受影响。要上正式版，最晚在 12 月初开始封闭测试。
3. **联系邮箱**：info@novawerk.io（用户 2026-10-10 定）。

## 规矩

- 签名密钥、证书、上传密钥、密码不进 git，也不发在消息里。见 [signing.md](./signing.md)。
- 提交任何审核（包括 TestFlight 外部测试的 Beta 审核）、邀请测试员、接受协议，都要先问用户。
- 代码一改数据流（新增接口、新 SDK、新存储），就回来更新 [privacy-labels.md](./privacy-labels.md) 和 [privacy-policy.md](./privacy-policy.md)。
