// Voice: one scripted call against the real agent over its WebSocket, to measure latency (ADR 0013).
// Needs ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID, and the agent pointed at a running API.
//   node scripts/voice-test/call.mjs zh <caseId> line1.wav line2.wav sil:15
// Each .wav is 16 kHz mono 16-bit PCM (`say -o a.aiff "…"; afconvert -f WAVE -d LEI16@16000 -c 1 a.aiff a.wav`).
// sil:N stays silent for N seconds. Prints the time from the end of each line to the first reply audio.
import { readFileSync } from "node:fs";
const [locale, caseId, ...steps] = process.argv.slice(2);
const { ELEVENLABS_API_KEY: key, ELEVENLABS_AGENT_ID: agent } = process.env;
const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agent}`, { headers: { "xi-api-key": key } });
const { signed_url } = await r.json();
const ws = new WebSocket(signed_url);
const now = () => performance.now();
const t0 = now();
let spokeEnd = 0, firstAudio = 0, turn = 0, ended = false, audioBytes = 0, lastAudioAt = 0, cutIn = 0;
const log = (...a) => console.log(((now() - t0) / 1000).toFixed(2).padStart(7), ...a);
ws.onopen = () => ws.send(JSON.stringify({
  type: "conversation_initiation_client_data",
  dynamic_variables: { psygym: `case=${caseId} locale=${locale}` },
  custom_llm_extra_body: { caseId, locale },
  conversation_config_override: { agent: { language: locale } },
}));
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.type === "ping") ws.send(JSON.stringify({ type: "pong", event_id: m.ping_event.event_id }));
  else if (m.type === "audio") {
    audioBytes += m.audio_event.audio_base_64.length * 0.75;
    lastAudioAt = now();
    if (spokeEnd && !firstAudio) { firstAudio = now(); log(`turn ${turn}: first audio ${((firstAudio - spokeEnd) / 1000).toFixed(2)}s after the speaker stopped`); }
  } else if (m.type === "user_transcript") log("heard:", m.user_transcription_event.user_transcript);
  else if (m.type === "agent_response") log(`client (${m.agent_response_event.agent_response.length} chars):`, m.agent_response_event.agent_response.slice(0, 60));
  else if (m.type === "conversation_initiation_metadata") log("metadata", JSON.stringify(m.conversation_initiation_metadata_event));
  else if (m.type === "agent_tool_response") log("tool", JSON.stringify(m.agent_tool_response));
  else if (m.type === "interruption") log(`interruption${cutIn ? `, ${((now() - cutIn) / 1000).toFixed(2)}s after cutting in` : ""}`);
  else if (m.type === "agent_response_correction") log(`correction: kept ${m.agent_response_correction_event.corrected_agent_response.length} of ${m.agent_response_correction_event.original_agent_response.length} chars`);
  else if (!["vad_score", "internal_tentative_agent_response", "agent_chat_response_part", "agent_response_metadata"].includes(m.type)) log("event", m.type);
};
ws.onclose = (e) => { ended = true; log("closed", e.code, e.reason); };
ws.onerror = (e) => log("ws error", e.message);
const sleep = (ms) => new Promise((f) => setTimeout(f, ms));
while (ws.readyState !== 1) await sleep(20);
const CHUNK = 3200; // 100 ms at 16 kHz, 16-bit
const silence = Buffer.alloc(CHUNK);
const send = (b) => ws.readyState === 1 && ws.send(JSON.stringify({ user_audio_chunk: b.toString("base64") }));
const pad = async (s) => { for (let i = 0; i < s * 10 && !ended; i++) { send(silence); await sleep(100); } };
await pad(1);
let played = 0;
for (const step of steps) {
  if (ended) break;
  firstAudio = 0; spokeEnd = 0; lastAudioAt = 0; cutIn = 0; turn++;
  if (step.startsWith("sil:")) { spokeEnd = now(); await pad(+step.slice(4)); continue; }
  // barge:<seconds>:<wav>: wait for the reply to start, let it run, then cut in.
  if (step.startsWith("barge:")) {
    const [, wait, wav] = step.split(":");
    while (!lastAudioAt && !ended) await pad(0.2);
    await pad(+wait);
    cutIn = now();
    log(`cutting in ${wait}s into the reply`);
    const pcm = readFileSync(wav).subarray(44);
    for (let i = 0; i < pcm.length && !ended; i += CHUNK) { send(pcm.subarray(i, i + CHUNK)); await sleep(100); }
    await pad(6);
    continue;
  }
  const pcm = readFileSync(step).subarray(44);
  log(`turn ${turn}: speaking ${(pcm.length / 32000).toFixed(1)}s`);
  for (let i = 0; i < pcm.length && !ended; i += CHUNK) { send(pcm.subarray(i, i + CHUNK)); await sleep(100); }
  spokeEnd = now();
  for (let i = 0; i < 300 && !firstAudio && !ended; i++) { send(silence); await sleep(100); }
  await pad(3);
  // Stay quiet while the reply would still be playing on a phone.
  await pad(Math.min(30, audioBytes / 32000 - played)); played = audioBytes / 32000;
}
if (!ended) ws.close();
await sleep(500);
console.log(JSON.stringify({ audioSeconds: audioBytes / 32000 }));
