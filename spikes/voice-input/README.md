# Voice input spike (not merged)

Throwaway code behind [docs/product/voice-input.md](../../docs/product/voice-input.md) and ADR 0010.

## bench/ (on a Mac)

- `zh.txt`, `en.txt`: the 20 + 20 test sentences (from `content/cases` and `content/rubrics`).
- Make the audio with macOS TTS, 16 kHz mono:
  `say -v Tingting -o wav/zh-1-Ting.wav --data-format=LEI16@16000 "…"` (see the doc for the voices).
- `bench.py <dir> <model> <threads>`: sherpa-onnx streaming in 100 ms chunks, 1.5 s tail padding on
  release. `<dir>` holds `zh.txt`, `en.txt`, `wav/` and `models/<unpacked release>`.
  `pip install sherpa-onnx soundfile numpy`.
- `score.py`: error rate per voice from `out/*.json`.
- `apple/`: `SpeechTranscriber` on macOS 26 (same framework as iOS 26).
  `swiftc -O main.swift -o applebench -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker Info.plist`,
  then `./applebench transcriber zh wav/zh-*.wav`.

## android/ (test app)

```
./fetch-aar.sh && ./gradlew :app:assembleRelease
adb install app/build/outputs/apk/release/app-release.apk
./push-models.sh <dir with unpacked models> [<wav dir>]   # or the in-app 下载 button (GitHub)
```

Pick a model → 加载 → hold the button. 朗读测试 shows the 40 sentences one by one and writes
`files/results-*.json` (error rate, first-partial latency, release-to-final, CPU, PSS, battery).
文件测试 runs `files/wav/*.wav` in real time instead of the microphone.
