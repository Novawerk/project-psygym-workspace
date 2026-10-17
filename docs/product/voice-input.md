# 按住说话（语音输入）

**状态：** 方案已定（2026-10-17，用户）。决定和理由见 [ADR 0010](../decisions/0010-voice-input.md)。界面草案待用户在看板确认。

**一句话：** 会谈页（S1）可以按住说话。声音只在手机上转成文字，不上传、不存盘，也不用键盘自带的语音输入。转出来的文字放进输入框，用户改完自己点发送。

---

## 1. 方案

| | iOS | Android |
|---|---|---|
| 引擎 | 系统 Speech 框架，只走端侧 | sherpa-onnx 1.13.8（Apache-2.0），onnxruntime 静态链接版 AAR |
| 模型 | 系统自带，由系统下载和更新 | X-ASR 480 ms 流式中英，带标点，int8（Apache-2.0） |
| 语言 | zh-CN、en-US，跟界面语言 | 一个模型同时识别中英，中英混说也可以 |
| 对安装包的影响 | 没有 | 安装包增加约 9 MB（下载）/ 24 MB（安装后），按单个 ABI 算 |
| 第一次使用 | iOS 26：系统下载语言模型（在 Mac 上实测中文约 370 MB、英文约 390 MB，iPhone 上的大小没测） | 下载 169 MB，从我们自己的域名 |
| 不依赖 | 网络 | 网络、Google 服务 |

### iOS 按系统版本

| 系统 | 用什么 | 不支持时 |
|---|---|---|
| iOS 26 及以上 | `SpeechAnalyzer` + `SpeechTranscriber`，打开 `fastResults` 和 `volatileResults`。设备不支持时（开发者论坛的说法是 iPhone 11、SE2 这类不行，12 及以上可以）改用 `DictationTranscriber` | 两个都不可用：说明「这台设备不支持离线语音识别」，麦克风按钮不可用 |
| iOS 16–25 | `SFSpeechRecognizer`，`requiresOnDeviceRecognition = true`。**先检查** `supportsOnDeviceRecognition`，为 false 就不用 | 同上 |

- 只设 `requiresOnDeviceRecognition`、不检查 `supportsOnDeviceRecognition` 时，请求可能被发到苹果服务器。所以一定要先检查。
- 任何情况下都**不退回云端识别**。
- 旧版 `SFSpeechRecognizer` 有每次 1 分钟的限制。我们每次按住最长 60 秒，正好在限制以内。
- 国行 iPhone 上 `supportedLocales` 是否完整、系统模型在国内能否下载，都还没验证，要在第一轮 TestFlight 里确认。

---

## 2. 验证结果（2026-10-17）

**数据来源：** 测试句子取自 `content/cases/` 和 `content/rubrics/`，中英各 20 句，都是来访者和咨询师的原话，例如「自动思维」「认知歪曲」「最近有没有想过伤害自己」。录音是用 macOS 的 TTS 合成的，每句用两个声音：
- 自然声：Tingting（中文）、Samantha（英文）；
- 偏机器的声音：Reed。

一共 80 条录音。识别在 Mac（Apple 芯片，2 线程）上用流式方式跑：每 100 ms 喂一块音频，松手时补 1.5 秒静音。

**限制：**
- 合成语音比真人好认，所以自然声的结果偏乐观；机器声那一列更接近口音重、语速快的真人。
- 真机还没测（用户 2026-10-17 决定先不测）。下表的延迟只说明模型本身要等多久，不代表手机上的速度。

### 对比表

| 模型 | 流式 | 下载 / 解压 | 中文字错率 自然声 / 机器声 | 英文词错率 自然声 / 机器声 | 首字延迟¹ | 松手到全文² | 内存³ | 权重许可证 |
|---|---|---|---|---|---|---|---|---|
| **X-ASR 480 ms 中英 带标点 int8（选定）** | 是 | 134 MB / 169 MB | **0% / 10.3%** | **0% / 14.6%** | ≈1.1 s | 0.04 s | 529 MB | Apache-2.0 |
| X-ASR 480 ms 中英 int8（不带标点）⁴ | 是 | 134 MB / 169 MB | 6.5% / 11.3% | 7.8% / 16.7% | ≈1.1 s | 0.03 s | 490 MB | Apache-2.0 |
| X-ASR 160 ms 中英 int8⁴ | 是 | 134 MB / 169 MB | 5.1% / 17.8% | 4.2% / 22.9% | ≈0.8 s | 0.05 s | 594 MB | Apache-2.0 |
| 流式 Paraformer 中英（int8 文件） | 是 | 1.0 GB（打包了 fp32）/ 226 MB | 1.4% / 38% | 31% / 69% | ≈0.7 s | 0.02 s | 747 MB | FunASR 模型协议 v1.1：要署名，商用条款不明确 |
| 流式 Zipformer small CTC 中文 int8（2025-04-01） | 是 | 20 MB / 26 MB | 0.7% / 38% | 不支持英文 | ≈0.8 s | 0.01 s | 162 MB | 写的是 Apache-2.0，训练数据没说明 |
| 流式 Zipformer CTC 中文 int8（2025-06-30） | 是 | 122 MB / 161 MB | 1.0% / 41% | 不支持英文 | ≈0.5 s | 0.03 s | 462 MB | Apache-2.0；训练数据含 WenetSpeech，数据集说明写「非商业」 |
| Zipformer CTC 中文 int8（2025-07-03）⁵ | **否** | 287 MB / 353 MB | 0.7% / 4.8% | 不支持英文 | 说话时不出字 | 0.07 s | 972 MB | 同上 |
| iOS 26 `SpeechTranscriber`（在 macOS 26.5 上测） | 是 | 系统管理，不进 App | 1.0% / 18.8% | 0% / 5.7% | ≈1.1 s⁶ | 0.07 s | — | 系统框架 |

注：

1. 首字延迟：从开始说话到出现第一个字。主要取决于模型一次处理多长的音频（480 ms 的模型要攒够一块才出字）。
2. 松手到全文：在 Mac 上的耗时。手机慢几倍，估计 0.2–0.5 秒，需要真机确认。
3. 内存：整个测试进程的最大常驻内存，包括 Python 本身，只用来比较几个模型的相对大小。
4. 不带标点的 X-ASR，测试时只在松手时补了 0.8 秒静音，句尾的字更容易丢。带标点版先补 0.8 秒测了一次（中文 1.4% / 10.3%，英文 1.6% / 14.6%），改补 1.5 秒后自然声都是 0 错。正式实现按 1.5 秒做。
5. 这是用户点名的候选。它不是流式模型：说话时屏幕上不出字，要等松手后才出全文。
6. 必须打开 `.fastResults`。不打开时，第一个字要等约 3.9 秒才出来。

**中文字错率**：字错误数除以参考文本的字数，先去掉标点和空格。**英文词错率**：词错误数除以参考文本的词数，不分大小写、去掉标点。

### 为什么选 X-ASR（带标点）

- 在我们测的小型流式模型里，它是唯一一个中英文都识别得好的。中英混说也能识别（来访者和咨询师的话里常夹英文术语）。
- 自带标点和英文大小写，转出来的文字基本不用改就能发。
- 权重是 Apache-2.0，可以商用。
- 代价是体积：169 MB。用户要的是小模型，但小的中文模型完全不能识别英文，Paraformer 英文太差。
- 可以减小体积的路子：以后 X-ASR 出更小的版本；或者中文、英文各用一个小模型（中文 26 MB 加一个英文模型），但那样中英混说就不行了。

### 授权

| 组件 | 许可证 | 能否商用 | 要做什么 |
|---|---|---|---|
| sherpa-onnx（含 onnxruntime） | Apache-2.0（onnxruntime 是 MIT） | 能 | 在「关于」或开源许可页列出，附 NOTICE |
| X-ASR 模型 | Apache-2.0（GitHub 仓库和 HuggingFace 模型卡都这么写） | 能 | 同上。训练数据是约 100 万小时「开源 + 自采」，具体数据集没有公开 |
| Apple Speech 框架 | 系统 API | 能 | 无 |
| 流式 Paraformer（没选） | FunASR 模型开源协议 v1.1 | 不明确 | — |
| Zipformer 中文模型（没选） | Apache-2.0，训练数据含 WenetSpeech（数据集说明写「非商业」，同时又标了 CC BY 4.0） | 有风险 | — |

---

## 3. 模型下发（Android）

**要求：**
- 模型不打进安装包。
- 第一次点麦克风时提示下载。在移动网络下提醒「建议连 Wi-Fi」，但不强制。
- 下载完逐个文件做 SHA-256 校验；校验值写在 App 代码里，不从服务器取。
- 支持断点续传（HTTP Range），失败可以重试。
- 下载完放在 App 私有目录（`filesDir/asr/<模型名>/`），之后完全离线。
- 「我的」里可以删除模型，显示占用空间。

**需要总控建的下载地址**（这几个文件就是模型原始发布包里的文件，我们原样转存）：

| 文件 | 大小（字节） | SHA-256 |
|---|---|---|
| `encoder.int8.onnx` | 155,278,641 | `908596dcc137a73b95be908ca55e88caa1b3dbbe8027c171615f4b0609c5eb1e` |
| `decoder.onnx` | 11,309,084 | `a1cbc9eac2d5e3fb6617a218c67ad6daaa7f4e0fd225f08b2c22ab0413c8c257` |
| `joiner.int8.onnx` | 2,581,422 | `aedb7fa697b2ab43f20499826fff7c997eea7d67db77be97769aeeeb726e63b3` |
| `tokens.txt` | 58,806 | `b818a60878b9aae978cbb8ad594acbd403d76d1af2e31ef4197c84e2dbdba27c` |
| **合计** | **169,227,953（约 169 MB）** | |

- 来源：`https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-x-asr-480ms-streaming-zipformer-transducer-zh-en-punct-int8-2026-06-05.tar.bz2`
  - 大小 133,895,136 字节，SHA-256 `fa5f63d618e5a01526e275a358bb7772e403f84808a4769fba52cffd8160bf74`。
  - 解开后取上面 4 个文件，其他文件不用。
- 建议地址：`https://models.novawerk.io/asr/x-asr-480ms-zh-en-punct-int8-2026-06-05/<文件名>`。路径里带版本号，文件永不覆盖，换模型就换路径。
- 服务器要求：
  - 只走 HTTPS，支持 `Range`；
  - 设 `Cache-Control: public, max-age=31536000, immutable`；
  - 不需要登录，也不记录 IP 以外的东西（最好连访问日志也关掉）。
- **国内能下**：GitHub 和 HuggingFace 在国内都不稳定，所以要自己托管。
  - 建议用阿里云 OSS 香港区或腾讯云 COS 香港区，配 CDN。这两种都不需要 ICP 备案，国内访问也快。
  - Cloudflare R2 在国内比较慢，不建议作为唯一来源。
  - 总控建好后，请从国内网络测一下下载速度。
- 每个文件都单独下载、单独校验。这 4 个文件压缩后几乎不变小，打成 tar.bz2 也没意义，单独放还方便续传。

---

## 4. 界面（S1 会谈页输入区）

参照微信的「按住说话」。

### 入口和切换

- 输入框左边加一个麦克风图标按钮。点它，输入区变成一条全宽的「按住说话」按钮，麦克风图标变成键盘图标；再点键盘图标回到打字。
- App 记住上次用的是打字还是语音，只存本机。
- 来访者回复中、会谈已结束、达到消息上限时，和发送按钮一样不可用。

### 状态

| 状态 | 输入区 | 输入区上方的浮层 |
|---|---|---|
| 平时（语音模式） | 浅灰按钮「按住说话」 | 无 |
| 按下、说话中 | 按钮变深色，文字「松开 结束 · 上滑 取消」 | 浮层出现：上方一条随音量跳动的细波形，下面是实时文字。还没确定的字用浅灰色，确定的用正常颜色。右上角显示计时「0:12」 |
| 说话中，还没出字 | 同上 | 浮层只有波形和「正在听…」 |
| 上滑到取消区 | 按钮文字「松开 取消」 | 浮层变灰，显示 ✕ 和「松开手指，取消这段」 |
| 松手 | 回到打字模式，识别出的文字接在输入框已有内容后面，光标在末尾，键盘不自动弹出 | 浮层收起 |
| 松手但没识别出内容 | 回到语音模式 | 底部提示「没听清，再试一次。」 |
| 取消 | 回到语音模式，什么都不加 | 浮层收起 |
| 快到 60 秒 | — | 第 50 秒起计时变成「还能说 10 秒」；到 60 秒自动结束，效果和松手一样 |
| 没有麦克风权限（第一次） | 第一次按下时弹系统授权框，这次按下不录 | — |
| 权限被拒绝 | 按下后不录 | 底部弹层：「需要麦克风权限才能按住说话。声音只在这台手机上转成文字，不会上传。」按钮「去设置」「取消」 |
| 模型未下载（Android；iOS 26 系统模型未装） | 点麦克风图标时先出底部弹层，不切换模式 | 弹层：标题「下载语音识别模型」，正文「约 169 MB，只下载一次。下载后离线可用，声音只在这台手机上转成文字。」移动网络下多一行：「你现在用的是移动网络，建议连 Wi-Fi 再下载。」按钮「下载」「取消」 |
| 下载中 | 语音模式按钮显示「正在下载 45%」，不可按 | 弹层可以关掉，在后台继续下载；离开会谈页也不中断（App 被杀后，下次从断点继续） |
| 下载失败 / 校验失败 | 按钮「下载没完成，点这里重试」 | — |
| 不支持（iOS 设备或系统不支持端侧识别） | 点麦克风图标出弹层，不切换模式 | 「这台设备不支持离线语音识别。为了不把你的声音发到网上，这个功能没有打开。请用键盘输入。」按钮「知道了」 |

**无障碍**：
- 麦克风按钮的标签是「切换到语音输入」或「切换到键盘输入」。
- 读屏模式下，「按住说话」改成「点一下开始，再点一下结束」。读屏用户很难做按住的手势。

### 文案（中英，请产品确认）

| key | 中文 | English |
|---|---|---|
| voice_switch_to_voice | 切换到语音输入 | Switch to voice |
| voice_switch_to_keyboard | 切换到键盘输入 | Switch to keyboard |
| voice_hold | 按住说话 | Hold to talk |
| voice_release_send | 松开 结束 · 上滑 取消 | Release to finish · Slide up to cancel |
| voice_release_cancel | 松开 取消 | Release to cancel |
| voice_cancel_hint | 松开手指，取消这段 | Lift your finger to discard |
| voice_listening | 正在听… | Listening… |
| voice_time_left | 还能说 %d 秒 | %d seconds left |
| voice_nothing_heard | 没听清，再试一次。 | Didn't catch that. Try again. |
| voice_mic_denied | 需要麦克风权限才能按住说话。声音只在这台手机上转成文字，不会上传。 | Hold to talk needs the microphone. Your voice is turned into text on this phone and never uploaded. |
| voice_open_settings | 去设置 | Open Settings |
| voice_model_title | 下载语音识别模型 | Download the speech model |
| voice_model_body | 约 %d MB，只下载一次。下载后离线可用，声音只在这台手机上转成文字。 | About %d MB, downloaded once. Works offline after that; your voice is turned into text on this phone. |
| voice_model_cellular | 你现在用的是移动网络，建议连 Wi-Fi 再下载。 | You're on mobile data. Wi-Fi is better for this download. |
| voice_model_download | 下载 | Download |
| voice_model_progress | 正在下载 %d%% | Downloading %d%% |
| voice_model_failed | 下载没完成，点这里重试 | Download didn't finish. Tap to retry |
| voice_unsupported | 这台设备不支持离线语音识别。为了不把你的声音发到网上，这个功能没有打开。请用键盘输入。 | This device can't recognise speech offline. To keep your voice off the internet, this feature is off. Please type instead. |
| settings_voice_model | 语音识别模型 | Speech model |
| settings_voice_model_delete | 删除（%d MB） | Delete (%d MB) |

---

## 5. 权限和隐私

### 权限说明文字

| 平台 | 键 | 中文 | English |
|---|---|---|---|
| iOS | `NSMicrophoneUsageDescription` | 按住说话时，用麦克风听你说话。声音只在这台手机上转成文字，不会上传。 | To hear you while you hold to talk. Your voice is turned into text on this phone and never uploaded. |
| iOS | `NSSpeechRecognitionUsageDescription` | 在这台手机上把你说的话转成文字，不联网。 | To turn what you say into text on this phone, offline. |
| Android | `RECORD_AUDIO`（运行时权限，拒绝后用上表的 `voice_mic_denied` 说明） | — | — |

- iOS 要加 `InfoPlist.strings`（`en`、`zh-Hans`）做本地化。
- 两个平台都只在第一次按住说话时申请权限，引导页里不申请。[onboarding.md](./onboarding.md) 里「不申请任何系统权限」那条规则不受影响。

### 隐私标签和数据安全表要改什么

- **Apple App Privacy**：
  - **不加新的数据类型**。音频只在设备上处理，不离开设备，按苹果的定义不算「收集」。
  - 转出来的文字和打字一样发给服务器，已经在 Other User Content 里申报了。
  - **不要**勾 Audio Data。
- **`PrivacyInfo.xcprivacy`**：不用改。Speech 框架不在「需要说明理由的 API」名单里。
- **Google Play 数据安全表**：
  - 不改。Audio 选「不收集」。
  - Play 会看到 `RECORD_AUDIO` 权限。如果审核问起，回答：「仅用于按住说话，音频在设备上转成文字，不上传、不存储」。
- **要改的文档**：
  - [privacy-labels.md](../release/privacy-labels.md)：「Android 只申请 `INTERNET` 权限；iOS 没有任何 `NS*UsageDescription`」这一行，改成：Android 申请 `INTERNET` 和 `RECORD_AUDIO`，iOS 有麦克风和语音识别两个说明，都只用于端侧识别。
  - P3「隐私说明」加一问：
    - 问：「按住说话会上传我的声音吗？」
    - 答：「不会。声音只在你的手机上转成文字，不上传，也不保存。转出来的文字和你打的字一样，发送后才会交给 AI 模型处理。」
- 下载模型那次请求，我们的服务器只会看到一次普通的文件下载，不带账号。

---

## 6. 实现和工期

**结构**（`apps/mobile`）：

- `commonMain`：
  - `domain/voice/SpeechRecognizer` 接口：`availability()`、`start(locale, onPartial)`、`stop(): String`、`cancel()`；
  - `VoiceInputState` 状态机（第 4 节的各个状态）；
  - `ModelDownloader` 接口；
  - 会谈页 Composer 的按钮和浮层。
- `androidMain`：
  - `SherpaRecognizer`：用 `AudioRecord` 16 kHz 录音，按 100 ms 喂给模型，松手时补 1.5 秒静音；
  - `HttpModelDownloader`：分文件下载，Range 续传，校验 SHA-256，用 WorkManager 在后台跑。
- `iosMain`：
  - `AppleRecognizer`：iOS 26 用 `SpeechAnalyzer`，iOS 16–25 用 `SFSpeechRecognizer`；
  - Kotlin/Native 调不到 Swift-only 的 `SpeechAnalyzer`，所以这部分写在 `iosApp` 的 Swift 里，通过一个接口注入给 Kotlin。
- release 隔离：不涉及演示数据，不需要。
- 测试：
  - 状态机和字错率工具的单元测试；
  - 下载器测试：断点续传、校验失败、移动网络提示，用本地假服务器。

**工期估计**（一个人）：

| 部分 | 天数 |
|---|---|
| 状态机 + 界面 + 文案 | 1.5 |
| Android 识别 + 下载器 | 1.5 |
| iOS 两套识别 + Swift 桥接 | 1.5 |
| 截图、真机冒烟、审查修改 | 1 |
| **合计** | **约 5 天** |

前提：模型下载地址按时建好。没建好之前先用 GitHub 地址开发，上线前换掉。

**还要真机确认的**（第一轮内测）：
- 首字延迟、松手到全文、CPU、内存、耗电，用中端安卓机和一台 iPhone 测；
- 国行 iPhone 的端侧中文识别；
- 真人朗读的准确度：中英各 20 句，用第 2 节的句子。

验证代码在 `spike/voice-input` 分支，不合并：
- `spikes/voice-input/android`：测试 App，带朗读测试和文件测试，会记录字错率、延迟、CPU、内存和电量；
- 电脑上的测评脚本放在同一分支的 `spikes/voice-input/bench/` 下。
