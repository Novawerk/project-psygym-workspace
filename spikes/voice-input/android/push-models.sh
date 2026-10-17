#!/bin/sh
# Push unpacked model folders (and the test wavs) to the app's files dir.
# usage: push-models.sh <dir with model folders> [<wav dir>]
set -e
P=io.novawerk.voicespike
D=/sdcard/Android/data/$P/files
adb shell mkdir -p $D/models $D/wav
for m in "$1"/sherpa-onnx-*; do
  [ -d "$m" ] || continue
  n=$(basename "$m")
  adb shell mkdir -p "$D/models/$n"
  for f in tokens.txt encoder.int8.onnx decoder.int8.onnx decoder.onnx joiner.int8.onnx model.int8.onnx; do
    [ -f "$m/$f" ] && adb push "$m/$f" "$D/models/$n/$f" > /dev/null
  done
  echo "pushed $n"
done
[ -n "$2" ] && adb push "$2"/. $D/wav/ > /dev/null && echo "pushed wavs"
