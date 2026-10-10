# 0004 — Mobile app scaffold

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
- **Debug vs release:** decided by the binary, never by Gradle task names or flags.
  `AppConfig` reads `BuildConfig.DEBUG` (Android variant) and `Platform.isDebugBinary`
  (iOS). Release is fixed to `https://psygym-api.novawerk.io` in code and doesn't build
  the fake API at all. Debug uses the local backend and can switch to `FakePsygymApi`
  (demo data). Cleartext HTTP is allowed only by the debug variant's network security
  config.
- **Stream rules:** 30 s without any event (pings and `turn_start` count) is a timeout;
  a stream that ends without `turn_end` or `error` is a network error; unknown frame
  types are ignored, so new ones (like `session_end`) don't break older apps.
- **Before every practice:** a page with the case and the full notice from
  `docs/safety.md` §5; only "I understand" opens the session. A page, not a dialog, so it
  can become the case intro page.
- **Invite code, no login:** first launch asks once (skippable); a 401
  `invite_required` points to Settings.
- **Nothing kept:** the transcript lives in memory (`PracticeSession`) and is cleared
  when the practice ends. DataStore holds only language and invite code.
- **Practice history** (decision 0005): one JSON file per session under the app's private
  `history/` directory, read and written with okio. Saved when the report screen opens
  ("report unfinished") and updated when the report is in. A small file store is enough
  for a few hundred sessions; move to a database if history grows into search or stats.
- **Navigation:** three top-level pages with a bottom bar (Practise / History / Me); flow
  pages have none. Content is capped at 640dp wide, centred, for tablets.
