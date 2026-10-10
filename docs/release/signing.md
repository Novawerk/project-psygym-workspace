# 签名

密钥和密码只放在用户自己的电脑上，不进 git，也不发在任何消息、PR 或 issue 里。

## Android

我们用 **Play App Signing**：Google 保管真正的应用签名密钥，我们只保管一把**上传密钥**。上传密钥丢了，可以在 Play Console 申请重置，App 不会因此作废。

**用户来做（只做一次）：**

1. 在本机生成上传密钥。路径放在仓库外面，建议 `~/.psygym-release/psygym-upload.jks`：

   ```bash
   mkdir -p ~/.psygym-release && chmod 700 ~/.psygym-release
   keytool -genkeypair -v -keystore ~/.psygym-release/psygym-upload.jks \
     -alias psygym-upload -keyalg RSA -keysize 4096 -validity 10000
   ```

   keytool 会问密码和姓名，由用户自己输入。
2. 密码存进密码管理器（比如钥匙串或 1Password）。再把 `.jks` 备份一份到那里。
3. 在 `~/.gradle/gradle.properties` 加四行。这个文件在用户目录下，不在仓库里：

   ```properties
   PSYGYM_UPLOAD_STORE_FILE=/Users/<you>/.psygym-release/psygym-upload.jks
   PSYGYM_UPLOAD_STORE_PASSWORD=...
   PSYGYM_UPLOAD_KEY_ALIAS=psygym-upload
   PSYGYM_UPLOAD_KEY_PASSWORD=...
   ```

**移动端来做（代码）：** `release` 的 signingConfig 读上面四个属性或同名环境变量，读不到就不签名，别人本地照样能 build。产物用 `./gradlew :composeApp:bundleRelease`（AAB）。`.gitignore` 已经有 `*.jks` 和 `*.keystore`。

**第一次上传：** 在内部测试轨道「Create new release」，Play 会请我们确认用 Play App Signing（用 Google 生成的应用签名密钥，这是默认选项）。我们选默认选项。

## iOS

我们用 **Xcode Cloud**（`apps/mobile/iosApp/ci_scripts/ci_post_clone.sh`），和柏林中餐地图、YIMA 一样。Xcode Cloud 自己管分发证书和描述文件，不用在本机生成或下载证书。

- Team ID：`9VLTG4HRL9`，不是秘密。写进 `Config.xcconfig.template`，或者设成 Xcode Cloud 的环境变量 `TEAM_ID`。
- 签名方式：Automatic。
- build 号：每次上传都要比上次大。Xcode Cloud 用 `CI_BUILD_NUMBER` 写入 `CURRENT_PROJECT_VERSION`。
- 第一次在 Xcode Cloud 建 workflow 时，要把 GitHub 仓库 `Novawerk/project-psygym-workspace` 授权给 Xcode Cloud。授权由用户在 App Store Connect 里点。

如果以后要从本机用 Xcode 上传（不走 Xcode Cloud），Xcode 会在本机钥匙串里自动生成分发证书。那也是用户在自己电脑上做的事，证书不导出、不分享。

## 不要做

- 不把 `.jks`、`.p12`、`.p8`、`.mobileprovision`、`google-services.json` 或密码提交进 git。
- 不把密码写进 `gradle.properties`（仓库里那份）、`local.properties` 或 CI 配置文件的明文里。
- 不在 Slack、飞书、PR 评论里发密钥文件或密码。
