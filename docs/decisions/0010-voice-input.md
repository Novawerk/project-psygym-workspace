# 0010 — Hold-to-talk, recognised on the phone

Date: 2026-10-17. Status: **accepted** (the user, 2026-10-17). The product spec, the measurements
and the screen states are in [`product/voice-input.md`](../product/voice-input.md). Hold to talk stays
as written here; the separate voice session (ADR 0013) does send audio out, after its own consent.

## Decision

The practice page (S1) gets a "hold to talk" mode. Speech becomes text **on the phone**. Audio is
never uploaded, never written to disk, and we use neither the keyboard's voice input nor a cloud
speech API. The text lands in the input box; the user edits and sends it as if typed.

- **iOS:** Apple's Speech framework, on-device only.
  - iOS 26+: `SpeechAnalyzer` + `SpeechTranscriber` with `.fastResults` and `.volatileResults`.
    On devices where `SpeechTranscriber.isAvailable` is false, use `SFSpeechRecognizer` on
    the device, as below. Apple downloads
    and manages the language model (`AssetInventory`); it doesn't count against our app size.
  - iOS 16–25: `SFSpeechRecognizer` with `requiresOnDeviceRecognition = true`, and only if
    `supportsOnDeviceRecognition` is true for that locale. `requiresOnDeviceRecognition` alone
    is not enough: when on-device isn't supported, the request may go to Apple's servers.
  - No on-device support for the UI language: the mic button explains why and stays off.
    **Never fall back to the cloud.**
- **Android:** [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) 1.13.8 (Apache-2.0), the
  AAR with onnxruntime linked in, and **X-ASR 480 ms streaming zh-en, with punctuation, int8**
  (`sherpa-onnx-x-asr-480ms-streaming-zipformer-transducer-zh-en-punct-int8-2026-06-05`,
  Apache-2.0). No Google services, so it works on phones sold in China. The model (169 MB) is
  not in the APK: it's downloaded on first use from our copy on Vercel Blob (Hong Kong), checked against SHA-256
  values built into the app, then works offline.
- Both platforms recognise Chinese and English. The language follows the app's UI language.

## Why

- Hand-typing long counselor turns on a phone is the slowest part of a session.
- Keyboard voice input (Gboard, Sogou, iFlytek, Apple dictation) sends audio to their servers
  under their own terms; we couldn't tell users where their voice goes. On-device recognition
  keeps the privacy story we have: the conversation text goes to our server and the model
  provider, nothing else.
- X-ASR over the other sherpa-onnx models we measured: the only small streaming model that
  handles both Chinese and English well, punctuation included; the smaller Chinese-only models
  can't do English at all, and the streaming Paraformer is weaker on English, larger, and under
  the FunASR model licence. Its weights are Apache-2.0; the Zipformer Chinese models are trained
  on WenetSpeech, whose dataset card says non-commercial.
- iOS has a good on-device recogniser built in, at no size cost to us.

## Consequences

- New permissions: microphone on both platforms; speech recognition on iOS. Usage strings are
  in the spec. Asked on the first hold, never during onboarding.
- Privacy labels: no new data type. Audio is processed on the device and not collected; the
  text is sent like typed text (already "Other User Content"). `privacy-labels.md` changes only
  the "which permissions" row.
- Android install size grows by about 10 MB download / 27 MB installed per ABI (the native
  library). The model is a separate 169 MB download.
- We host the model files: Vercel Blob, Hong Kong region (the user's choice, 2026-10-17), HTTPS,
  range requests. If the host moves, the app's SHA-256 check stays.
- Not measured on real phones yet (the user's call, 2026-10-17). Accuracy numbers come from
  synthetic speech on a Mac; phone latency, CPU and battery are still open. Measure them in the
  first TestFlight / internal testing round and record them in the spec.

## Not chosen

- `DictationTranscriber` as the iOS 26 fallback: the old `SFSpeechRecognizer`, on-device only,
  covers the same devices and also iOS 16–25, so one fallback is enough.

- Cloud speech APIs (any vendor): audio leaves the phone.
- `zipformer-ctc-zh-int8-2025-07-03`: not streaming (no live text while speaking), 287 MB,
  Chinese only.
- sherpa-onnx on iOS as well: possible later for devices without on-device support, at about
  the same size cost as on Android. Not now.
