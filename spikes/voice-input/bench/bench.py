"""Accuracy and (desktop) speed of sherpa-onnx models on the test sentences.

Simulates hold-to-talk: 100 ms chunks fed as they would arrive, then input_finished on release.
Usage: bench.py <asr dir> <model key> <threads>
"""
import json, re, sys, time, unicodedata
from pathlib import Path

import numpy as np
import sherpa_onnx
import soundfile as sf

A = Path(sys.argv[1]); key = sys.argv[2]; threads = int(sys.argv[3])
M = A / 'models'


def online(kind, d, **kw):
    d = M / d
    if kind == 'ctc':
        return sherpa_onnx.OnlineRecognizer.from_zipformer2_ctc(tokens=str(d / 'tokens.txt'), model=str(d / 'model.int8.onnx'), num_threads=threads, **kw)
    if kind == 'tr':
        return sherpa_onnx.OnlineRecognizer.from_transducer(tokens=str(d / 'tokens.txt'), encoder=str(d / 'encoder.int8.onnx'),
                                                           decoder=str(d / 'decoder.onnx'), joiner=str(d / 'joiner.int8.onnx'), num_threads=threads, **kw)
    if kind == 'para':
        return sherpa_onnx.OnlineRecognizer.from_paraformer(tokens=str(d / 'tokens.txt'), encoder=str(d / 'encoder.int8.onnx'),
                                                           decoder=str(d / 'decoder.int8.onnx'), num_threads=threads, **kw)


MODELS = {
    'small-ctc-zh': ('ctc', 'sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01'),
    'ctc-zh-0630': ('ctc', 'sherpa-onnx-streaming-zipformer-ctc-zh-int8-2025-06-30'),
    'xasr-160': ('tr', 'sherpa-onnx-x-asr-160ms-streaming-zipformer-transducer-zh-en-int8-2026-06-05'),
    'xasr-480': ('tr', 'sherpa-onnx-x-asr-480ms-streaming-zipformer-transducer-zh-en-int8-2026-06-05'),
    'xasr-480-punct': ('tr', 'sherpa-onnx-x-asr-480ms-streaming-zipformer-transducer-zh-en-punct-int8-2026-06-05'),
    'paraformer-zh-en': ('para', 'sherpa-onnx-streaming-paraformer-bilingual-zh-en'),
    'ctc-zh-0703-offline': ('off', 'sherpa-onnx-zipformer-ctc-zh-int8-2025-07-03'),
}


def norm_zh(s):
    s = unicodedata.normalize('NFKC', s)
    return [c for c in s if not re.match(r'[\s\W_]', c)]


def norm_en(s):
    return re.sub(r"[^a-z' ]", ' ', s.lower().replace('▁', ' ')).split()


def edits(r, h):
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        p, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (r[i - 1] != h[j - 1]))
    return d[len(h)]


def onset(x, sr):
    e = np.convolve(np.abs(x), np.ones(160) / 160, 'same')
    i = np.argmax(e > 0.02 * np.abs(x).max() * 5)
    return i / sr


kind, d = MODELS[key]
t0 = time.time()
if kind == 'off':
    rec = sherpa_onnx.OfflineRecognizer.from_zipformer_ctc(tokens=str(M / d / 'tokens.txt'), model=str(M / d / 'model.int8.onnx'), num_threads=threads)
else:
    rec = online(kind, d)
load = time.time() - t0

refs = {'zh': (A / 'zh.txt').read_text().splitlines(), 'en': (A / 'en.txt').read_text().splitlines()}
out = {'model': key, 'threads': threads, 'load_s': round(load, 2), 'langs': {}}
for lang in ('zh', 'en'):
    E = N = 0; first = []; final = []; rtf_a = rtf_c = 0; samples = []
    for wav in sorted((A / 'wav').glob(f'{lang}-*.wav')):
        i = int(wav.stem.split('-')[1]); ref = refs[lang][i - 1]
        x, sr = sf.read(str(wav), dtype='float32')
        dur = len(x) / sr
        if kind == 'off':
            t = time.time(); s = rec.create_stream(); s.accept_waveform(sr, x); rec.decode_stream(s); hyp = s.result.text
            fin = time.time() - t; fc = None; comp = fin
        else:
            s = rec.create_stream(); step = int(0.1 * sr); comp = 0; fc = None; on = onset(x, sr)
            for k in range(0, len(x), step):
                t = time.time(); s.accept_waveform(sr, x[k:k + step])
                while rec.is_ready(s): rec.decode_stream(s)
                c = time.time() - t; comp += c
                if fc is None and rec.get_result(s).strip():
                    fc = (k + step) / sr - on + c  # audio still to arrive + compute
            # Release: pad 1.5 s of silence so the model flushes its right context, then finish.
            t = time.time(); s.accept_waveform(sr, np.zeros(int(1.5 * sr), dtype='float32')); s.input_finished()
            while rec.is_ready(s): rec.decode_stream(s)
            hyp = rec.get_result(s); fin = time.time() - t; comp += fin
        r, h = (norm_zh(ref), norm_zh(hyp)) if lang == 'zh' else (norm_en(ref), norm_en(hyp))
        E += edits(r, h); N += len(r)
        if fc is not None: first.append(fc)
        final.append(fin); rtf_a += dur; rtf_c += comp
        if len(samples) < 40: samples.append([wav.stem, ref, hyp])
    out['langs'][lang] = {
        'err_rate': round(100 * E / N, 1), 'n_utts': len(final),
        'first_partial_s_median': round(float(np.median(first)), 3) if first else None,
        'release_to_final_s_median': round(float(np.median(final)), 3),
        'rtf': round(rtf_c / rtf_a, 3), 'samples': samples,
    }
print(json.dumps(out, ensure_ascii=False))
