# 聆镜 PSYGYM · mobile app

Kotlin Multiplatform + Compose Multiplatform, Android and iOS. One module,
`composeApp`; `iosApp` is the Xcode shell. Same stack and layout as Novawerk's
YIMA and Berlin Chinese Food Map. See [docs/decisions/0001-stack.md](../../docs/decisions/0001-stack.md)
and [0004-mobile-app.md](../../docs/decisions/0004-mobile-app.md).

The app only talks to our backend ([docs/api-contract.md](../../docs/api-contract.md)).
No AI SDK, no model keys on the device. On the phone it keeps settings (DataStore) and,
unless the user turns it off under Me, practice history: one JSON file per finished
session in app-private storage, unencrypted, never uploaded
([decision 0005](../../docs/decisions/0005-local-practice-history.md)). Android:
`allowBackup=false` plus data extraction rules. iOS: Application Support, excluded from
backup.

## Run it

Needs JDK 17+ and the Android SDK (`local.properties` with `sdk.dir`, or `ANDROID_HOME`).

```bash
./gradlew :composeApp:installDebug
```

Debug builds start on **demo data** (`FakePsygymApi`): fake cases and fake streams,
no server needed. Turn it off in Settings → Developer to use a backend.

| Build | Backend | Demo data |
|-------|---------|-----------|
| Android debug variant | `http://10.0.2.2:8787` (your laptop, from the emulator) | on, switchable |
| iOS Debug configuration | `http://localhost:8787` | on, switchable |
| Android release variant, iOS Release | `https://psygym-api.novawerk.io` | impossible |

The build decides, not a flag: `AppConfig` reads `BuildConfig.DEBUG` on Android and
`Platform.isDebugBinary` on iOS. Release is fixed to production in code and never builds
the fake API. Plain HTTP is allowed only in the debug variant
(`src/androidDebug/res/xml/network_security_config.xml`).

Debug-only overrides: `-Ppsygym.apiBaseUrl=http://192.168.1.20:8787` (a phone on your
Wi-Fi) and `-Ppsygym.fakeApi=false`.

Local backend, from the repo root: `LLM_PROVIDER=mock pnpm --filter api dev`.
Port 8787 is a common default; if another dev server already holds it (Novawerk's API
does), `/cases` answers 404 and the app says it can't load the cases. Run ours on another
port (`PORT=8789 …`) and build with `-Ppsygym.apiBaseUrl=http://10.0.2.2:8789`.

### iOS

Copy `iosApp/Configuration/Config.xcconfig.template` to `Config.xcconfig`, set
`TEAM_ID`, open `iosApp/iosApp.xcodeproj` in Xcode. The "Compile Kotlin Framework"
phase runs Gradle. As in YIMA, we don't build iOS locally in day-to-day work; check
the shared code with:

```bash
./gradlew :composeApp:compileKotlinIosSimulatorArm64
```

## Release

**Android (Play internal testing).** `./gradlew :composeApp:bundleRelease` →
`composeApp/build/outputs/bundle/release/composeApp-release.aab`. It is signed with the
Play *upload* key when these four are set in `~/.gradle/gradle.properties` or the
environment, and left unsigned otherwise (so anyone can still build):

```
PSYGYM_UPLOAD_STORE_FILE=/path/outside/the/repo/psygym-upload.jks
PSYGYM_UPLOAD_STORE_PASSWORD=…
PSYGYM_UPLOAD_KEY_ALIAS=upload
PSYGYM_UPLOAD_KEY_PASSWORD=…
```

Play App Signing holds the real app key. The upload key and its passwords never go in git.
Each upload needs a higher versionCode, and nothing counts for us on Android: **bump
`app-versionCode` in `gradle/libs.versions.toml` before every release** (or pass
`VERSION_CODE=…` for one build).

**iOS (TestFlight via Xcode Cloud).** Team `9VLTG4HRL9`, automatic signing, bundle id
`io.novawerk.psygym`. `ci_scripts/ci_post_clone.sh` writes `Config.xcconfig` from the
template with `CURRENT_PROJECT_VERSION = CI_BUILD_NUMBER`, so build numbers always go up.
`MARKETING_VERSION` follows `app-versionName`. The Release configuration uses
`Info-Release.plist` and talks to production only.

## Tests

```bash
./gradlew :composeApp:testDebugUnitTest
```

`commonTest` covers `/cases` and error mapping with Ktor's MockEngine.
`androidUnitTest` runs the real SSE path: the OkHttp engine against a small local
JDK HTTP server (MockEngine has no SSE support): deltas, pings, unknown frame types,
error frames, missing `turn_end`, the 30 s idle timeout, `Retry-After`.

## Where things are

```
composeApp/src/commonMain/kotlin/io/novawerk/psygym/
├── App.kt                    # NavHost, language, theme
├── AppConfig.kt              # debug vs release, backend URL
├── data/api/                 # PsygymApi, KtorPsygymApi (SSE), FakePsygymApi, SwitchingPsygymApi
├── domain/model/             # Contract shapes (docs/api-contract.md)
├── domain/settings/          # DataStore: language, invite code, intro and disclaimer version, history switch
├── domain/practice/          # The session in progress (memory), the shared case list
├── domain/history/           # Saved sessions on the phone (decision 0005)
├── di/                       # kotlin-inject AppComponent
└── ui/                       # theme, locale, components, pages/ (ids from docs/product)
                              #   onboarding O1–O2, home H1, cases C1, briefing C2, practice S1/S2,
                              #   supervision R1, help X1, me P1, privacy P3, history M1/M2
composeApp/src/commonMain/composeResources/values{,-zh}/strings.xml
```

## Rules

- Every UI string goes in `strings.xml` (EN) and `values-zh/strings.xml` (ZH).
  Compose Resources doesn't unescape `\'`; use ’.
- Colours only in `ui/theme/Theme.kt`; screens read `MaterialTheme.colorScheme`.
- Case ids come from `GET /cases`. Never hard-code one.
- The app id is `app-id` in `gradle/libs.versions.toml` (Android) and
  `PRODUCT_BUNDLE_IDENTIFIER` in `iosApp/Configuration` (iOS).
- No secrets, signing files or Firebase configs in git.
