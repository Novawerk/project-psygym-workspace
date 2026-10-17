#!/bin/sh
# sherpa-onnx with onnxruntime linked in (one .so per ABI). Not committed.
set -e
V=1.13.8
cd "$(dirname "$0")/app/libs"
curl -sSLO "https://github.com/k2-fsa/sherpa-onnx/releases/download/v$V/sherpa-onnx-static-link-onnxruntime-$V.aar"
