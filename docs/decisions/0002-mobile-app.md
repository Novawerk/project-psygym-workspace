# 0002 — Mobile app scaffold

Date: 2026-10-10. Status: accepted.

- **App id:** `io.novawerk.psygym` on Android and iOS. One place each:
  `app-id` in `apps/mobile/gradle/libs.versions.toml`, `PRODUCT_BUNDLE_IDENTIFIER` in
  `apps/mobile/iosApp/Configuration`.
- **Versions** follow Berlin Chinese Food Map: Kotlin 2.3.21, Compose Multiplatform
  1.10.3, AGP 8.12.3, compileSdk 36. Navigation Compose 2.9.2 as in YIMA. Ktor 3.3.3.
- **Markdown:** `multiplatform-markdown-renderer-m3` **0.41.0**, not 0.45. From 0.42 the
  library is built with Kotlin 2.4, and 0.45 needs compileSdk 37 and a newer AGP. 0.41
  is built with our Kotlin 2.3.21. Move up when the other apps move.
- **Targets:** `iosArm64` and `iosSimulatorArm64`. No `iosX64`: the markdown library
  doesn't publish it, and we have no Intel Macs to serve.
- **Backend switch:** BuildKonfig picks the base URL at build time. Release (an Android
  `*Release` task or Xcode `CONFIGURATION=Release`) gets `https://psygym-api.novawerk.io`;
  debug gets the local backend. Debug builds can use `FakePsygymApi` (demo data) and
  show a Settings switch; release can't.
- **Invite code, no login:** first launch asks once (skippable); a 401
  `invite_required` points to Settings.
- **Nothing kept:** the transcript lives in memory (`PracticeSession`) and is cleared
  when the practice ends. DataStore holds only language and invite code.
