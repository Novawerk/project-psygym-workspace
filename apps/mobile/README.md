# 聆镜 PSYGYM · mobile app

Kotlin Multiplatform + Compose Multiplatform, Android and iOS. One module,
`composeApp`; `iosApp` is the Xcode shell. Same stack and layout as Novawerk's
YIMA and Berlin Chinese Food Map. See [docs/decisions/0001-stack.md](../../docs/decisions/0001-stack.md)
and [0002-mobile-app.md](../../docs/decisions/0002-mobile-app.md).

The app only talks to our backend ([docs/api-contract.md](../../docs/api-contract.md)).
No AI SDK, no model keys on the device. It stores two things locally: the language
choice and the invite code. Conversations live in memory and are gone when the
practice ends.

## Run it

Needs JDK 17+ and the Android SDK (`local.properties` with `sdk.dir`, or `ANDROID_HOME`).

```bash
./gradlew :composeApp:installDebug
```

Debug builds start on **demo data** (`FakePsygymApi`): fake cases and fake streams,
no server needed. Turn it off in Settings → Developer to use a backend.

| Build | Backend | Demo data |
|-------|---------|-----------|
| Android debug | `http://10.0.2.2:8787` (your laptop, from the emulator) | on, switchable |
| iOS debug | `http://localhost:8787` | on, switchable |
| Release (Android `*Release`, Xcode Release) | `https://psygym-api.novawerk.io` | off, no switch |

Overrides: `-Ppsygym.apiBaseUrl=http://192.168.1.20:8787` (a phone on your Wi-Fi)
and `-Ppsygym.fakeApi=false`.

Local backend, from the repo root: `LLM_PROVIDER=mock pnpm --filter api dev`.

### iOS

Copy `iosApp/Configuration/Config.xcconfig.template` to `Config.xcconfig`, set
`TEAM_ID`, open `iosApp/iosApp.xcodeproj` in Xcode. The "Compile Kotlin Framework"
phase runs Gradle. As in YIMA, we don't build iOS locally in day-to-day work; check
the shared code with:

```bash
./gradlew :composeApp:compileKotlinIosSimulatorArm64
```

## Tests

```bash
./gradlew :composeApp:testDebugUnitTest
```

`commonTest` covers `/cases` and error mapping with Ktor's MockEngine.
`androidUnitTest` runs the real SSE path: the OkHttp engine against a small local
JDK HTTP server (MockEngine has no SSE support).

## Where things are

```
composeApp/src/commonMain/kotlin/io/novawerk/psygym/
├── App.kt                    # NavHost, language, theme
├── data/api/                 # PsygymApi, KtorPsygymApi (SSE), FakePsygymApi, SwitchingPsygymApi
├── domain/model/             # Contract shapes (docs/api-contract.md)
├── domain/settings/          # DataStore: language, invite code
├── domain/practice/          # In-memory transcript for the supervision screen
├── di/                       # kotlin-inject AppComponent
└── ui/                       # theme, locale, components, pages/{home,cases,practice,supervision,settings}
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
