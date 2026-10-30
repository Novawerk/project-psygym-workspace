# 0013 — Voice sessions through an ElevenLabs agent

Date: 2026-10-25, updated 2026-10-30. Status: **accepted** (the user, 2026-10-25, confirmed 2026-10-30). Built on both sides, off by default.

## Decision

The trainee can talk to the AI client out loud, in real time. An **ElevenLabs agent** listens and
speaks. **The words still come from our backend:** the agent's LLM is set to "Custom LLM", pointing
at `POST /voice/llm/chat/completions`.

```
phone ──audio──▶ ElevenLabs agent ──OpenAI chat request──▶ our /voice/llm ──▶ model vendor
      ◀─audio──   (speech to text,  ◀──SSE text + end_call──   (client prompt, case,
                   text to speech)                               end_session, judge)
```

- **Same client as `/chat`.** Same prompt (`apps/api/prompts/client.md`) plus one voice note,
  same case, same `end_session` and `END_SESSION_JUDGE`. When the client ends the session, we
  answer with ElevenLabs' `end_call` tool after the closing line: it speaks the line, then hangs
  up. The agent's own system prompt is ignored except for the `{{psygym}}` marker.
- **Stateless.** ElevenLabs sends the whole conversation every turn. We store nothing and log no
  text, as for `/chat`. Counts are the same as `/chat` (`chat_turn`, `session_started`,
  `session_ended_by_client`).
- **No key on the phone.** The agent is private. The app asks `POST /voice/session` (behind the
  usual gate) for a short-lived conversation token, and gets back what to pass when it starts the
  call: `dynamicVariables.psygym` and `extraBody` (case and language). `GET /voice/status` tells
  the app whether to show the entry at all.
- **ElevenLabs authenticates to us** with `VOICE_LLM_SECRET` (the agent's custom-LLM API key).
- **Off by default.** Without `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` and `VOICE_LLM_SECRET`,
  the routes answer 404 and the app shows nothing. Hold to talk doesn't change.
- **The supervisor report** stays text: the app keeps the transcript the SDK reports and calls
  `/supervision` as today.
- **One interface in the app** (`VoiceCall`): `io.elevenlabs:elevenlabs-android` on Android, the
  ElevenLabs Swift SDK on iOS. Screens and flow: [`product/voice-session-design.md`](../product/voice-session-design.md).
- **A call that drops goes on by typing**, not by calling again: a new ElevenLabs call has no
  memory, while `/chat` takes the whole transcript each turn.

## Agent settings (in the ElevenLabs dashboard)

- LLM: Custom LLM. Server URL `https://<api host>/voice/llm`: ElevenLabs adds
  `/chat/completions` itself (checked 2026-10-26; a full path ends up doubled and fails). API key
  secret = `VOICE_LLM_SECRET`.
- System prompt: only `{{psygym}}`. First message: empty (the trainee speaks first). Language
  override allowed (the app asks for `zh` or `en`); custom-LLM extra body allowed.
- System tools: `end_call` on; nothing else.
- Turn: eagerness `patient`, turn timeout 6 s, no soft-timeout fillers, never end the call on
  silence, **speculative turn off**. After 6 s of the trainee's silence ElevenLabs sends `...` as
  their turn; we pass it on as 「（咨询师没有说话，在等你继续）」 and the client goes on by itself,
  the way the client in the practice dialogues (0012) keeps talking while the counselor stays quiet.
- Privacy: `record_voice` off, `retention_days` 0, **`delete_transcript_and_pii` on** (off, 0 days
  still keeps the transcript: see below), `delete_audio` on.
- Limits: `max_duration_seconds` 1200. Agent limits today: 2 at once, 30 calls a day; raise them
  before real users (the plan allows 10 at once).
- Authentication on (private agent).

## Why

- Voice practice is closer to a real session than typing. Hold-to-talk (ADR 0010) helps typing,
  but turn-taking, pauses and interruptions only exist in real time.
- Keeping our backend as the brain means one client, one set of safety rules, one place to fix
  them. ElevenLabs' built-in LLM would mean a second copy of the prompt and the harm logic.

## Consequences

- **This reverses part of ADR 0010 and `safety.md` §1 for voice sessions:** the trainee's audio
  goes to ElevenLabs (a US company) to be transcribed and the reply is synthesised there. Typing
  and hold-to-talk stay as they are. Before the app ships voice, update `safety.md`, the privacy
  policy, the store privacy labels and review notes, and the in-app notice before a voice session.
- Without Zero Retention Mode, ElevenLabs keeps logs we don't control even at 0-day retention.
  Check the plan and the data processing terms before real users.
- Long sessions: the client side keeps the last 80 messages (`MAX_MESSAGES`), like `/chat`. A call
  stops at 20 minutes.

## The voice client must talk like the practice dialogues (the user, 2026-10-30)

This is the main acceptance test: the team's complaint was that practice "feels like a puzzle game"
(ADR 0012), and the user wants the distribution and the manner to match the real dialogues. A model
told "talk more" doesn't: it stays at 50–140 characters every turn.

- **Length is drawn, not hoped for.** In the real dialogues a turn's length hardly depends on what
  the counselor said: the median is 150–270 characters after an echo, a why or a long remark alike.
  So the server draws a target from the real distribution each turn (`TURN_LENGTHS`, numbers only).
- **The ask goes after the counselor's last words,** not in the system prompt, where the model ignores
  it and copies its own last reply. It never reaches ElevenLabs or the transcript.
- **Word habits are given as counts** scaled to the turn, from real rates. A question ending is
  drawn too, about one turn in eight.
- **`client.md`** gained thinking out loud, taking things back, concrete detail with other people's
  words, turns of a few words, and endings that aren't tidy. It also applies to typed sessions.

`scripts/voice-test/quality.mjs`, 160 turns, `cbt-depression-anxiety-01`, deepseek-chat, made-up
counselor lines:

| | Before | After | Real |
|---|---|---|---|
| Median characters | 75 | 225 | 203 |
| p90 | ~130 | 757 | 712 |
| Longest | 142 | 1,368 | 1,912 |
| Under 30 characters | 6% | 14% | 18% |
| Ends on a question | 4% | 14% | 12% |
| 就是 per 1,000 | | 9.9 | 10.3 |
| 然后 | 2.9 | 5.9 | 6.1 |
| 但是 | | 4.6 | 5.7 |
| 我觉得 | 0.3 | 2.8 | 4.2 |
| 感觉 | | 2.8 | 3.6 |
| 可能 | | 4.2 | 3.8 |
| 不知道 | | 2.9 | 2.7 |
| 怎么说 | 1.9 | 0.1 | 0.6 |
| 嗯 | 4.0 | 0.1 | 0.8 |

Still off: 我觉得 and 感觉 are low even when asked for more, and 怎么说 and 嗯 went too low after we
told it to stop opening with them. Runs vary by about ±15% on the long end. We didn't compare models
because deepseek-chat got this far and no Anthropic key was set. **The real test is reading it
blind against the dialogues, which only people can do.** The case's 说话风格 asks for 怎么说 and
long reasoned sentences, unlike the dialogues; changing that is for the psychologists.

**Safety under length.** Pushing for long, concrete turns made the client tell a bullying episode
in detail, against `safety.md` §4a. That's fixed: concrete detail is for daily life only, in
`client.md` and in every long ask. Twenty-one probes over two runs (who, where, how, step by step, what
method) got no details, and when pressed the client may now answer in a line. The length ask also made the model say the closing line and forget `end_session` (1 in 12 even with
the ask spelling it out), so a turn that is only a closing line now ends the call by itself; on the
second harmful remark, 12 scripted runs were checked for this.

**Long turns over the phone.** With the longest draw, on the real service: the first audio still
came 1.3–1.7 s after the trainee stopped, since speech starts from the first sentence. Cutting in 30 s
into a reply took 0.65 s (0.79 s at 12 s). Speech runs at roughly 5 characters a second, so 1,000
characters is over three minutes and 1,900 about six. That eats into the 20-minute limit and the
minutes on the plan. ElevenLabs sends a long reply in pieces; the app now corrects only the piece
that was cut off.

## Europe first (the user, 2026-10-30)

Voice sessions are built for European users first. The language doesn't change: the existing Chinese
cases, until the user says otherwise. Mainland availability is set aside (below).

| Question | What we found | Who decides |
|---|---|---|
| EU data residency | **Enterprise only.** A separate workspace, account and key at `eu.residency.elevenlabs.io`; our key is refused there. Data is stored in the EU; processing may still leave it (support, moderation, subprocessors), unless Zero Retention Mode is on too. Agents can be used there; existing ones are recreated | **Stay on Creator (the user, 2026-10-30).** The voice stays in the US |
| Where the voice goes today | The United States (global environment) | |
| DPA | [The DPA](https://elevenlabs.io/dpa) says it forms part of the agreement, and the SCCs count as signed when it takes effect. It doesn't say how a self-serve account gets it; the terms say it governs when you agree on behalf of an entity. The pricing page lists DPA terms only for Enterprise. **The user says it is signed (2026-10-30).** We haven't seen the document: contracting party and date are to be confirmed by the user, and nothing here should state them until then | Signed, per the user. Party and date open |
| Transfer basis | The DPA allows adequacy (the EU-US Data Privacy Framework) or SCCs. The public DPA (8 April 2026) lists both and doesn't say which comes first. ElevenLabs' [DPF page](https://elevenlabs.io/eu-us-data-privacy-framework-policy) says it is certified; we haven't checked the official list or which entity it covers. The policy and consent screen stay silent on the basis until the signed copy shows it | Needs the signed DPA and legal review |
| Training | [The terms](https://elevenlabs.io/terms-of-use) let ElevenLabs use content to improve its services, with an opt-out under **Data use** in the account settings, from then on. We can't read that setting through the API. **Off, as the user reports (2026-10-30).** Not something we can confirm through the API | Decided |
| The other transfer | The text ElevenLabs hears goes through our server in Frankfurt to **DeepSeek in China**. For European users this is a harder transfer than the US one, and it's the same in typed sessions. An EU model would fix it; `CLIENT_LLM_*` already allows that. **Kept for now: the user, 2026-10-30, 「先保留 DeepSeek」.** V1 says so plainly | Decided |
| Legal basis for the voice | Consent, separately (V1), withdrawable under Me. Whether a voice counts as article 9 data needs legal review | Needs legal review |

**Latency from the EU endpoint is not measured.** It needs an EU workspace. Connecting from Germany took
50 ms to the global API and 96 ms to the EU one, and 134 ms and 104 ms to the two media hosts. That's
the TCP handshake only, and the differences are small next to the 2 s turn, most of it the model.

## Checked on the real service (2026-10-30)

Calls were run from Germany against a real agent, with the API on a laptop behind a tunnel: spoken
audio over the agent's WebSocket (`apps/api/scripts/voice-test/call.mjs`) and, for the app, the
Android SDK over WebRTC.

**What ElevenLabs sends.** `POST <server url>/chat/completions` with `elevenlabs_extra_body`
(`caseId`, `locale`), a `system` message, alternating `user` and `assistant`, and `tools: [end_call]`.
Both ways of passing the case work; `extra_body` is what arrives. Chinese and English both work.

**Latency.** From the end of the trainee's speech to the first audio of the reply: **1.5–3.0 s,
usually about 2 s** (10 Chinese turns; one English first turn took 4.1 s). Our part, the model's whole reply,
is 1.1–2.2 s of that (DeepSeek, measured at our server, including one prompt of about 6,800 tokens).
So the model is the biggest piece. It feels like a person thinking, not like a phone line. Note
that the WebSocket test skips the WebRTC leg a phone uses, and the API behind a tunnel adds a
little.

**Speculative turn.** On, ElevenLabs asks for a reply before the trainee has finished: 2–3 model
calls per turn, double token cost, and inflated counts. It saved no measurable time (1.5–2.3 s with
it, 1.5–3.0 s without, on few turns). We turned it off. Dropped requests still happen now and then;
they aren't counted any more.

**Ending.** The harm rule works over voice: first remark, the client stays and is hurt; second
remark, one closing line, then `end_call`, and the call closes. A spoken line can't be held back, so
with `END_SESSION_JUDGE=on` the check runs before the line goes out; that adds to the wait and
wasn't tested here (it was off).

**Mishearing.** Scribe turned one synthetic 「你这点事算什么」 into 「你这见识算什么」. The report
quotes what ElevenLabs heard. Worth watching in real use.

## Retention and plan (2026-10-30)

- **Plan: Creator.** 275 minutes a month included, then $0.08 a minute (1 minute came to about 440
  credits on a 131,000-credit month). Our model tokens are on top. 100 trainees at 15 minutes a
  week is about 6,500 minutes a month, about $500. A 20-minute cap and the concurrency limits apply.
- **Zero Retention Mode is enterprise only** (select customers), so it isn't available to us. Its
  docs don't say how it works with a custom LLM.
- **`retention_days: 0` alone was not enough.** The spike agent had it, and transcripts of the
  2026-10-26 calls are still there four days later: `delete_transcript_and_pii` was off. Audio and
  logs had gone about 75 minutes after each call. We turned it on and checked: the transcripts of the
  2026-10-30 calls were gone 12–55 minutes after each call, deleted in a batch, with their logs. The
  eight 2026-10-26 test calls (scripted lines, nothing real) stay until someone deletes them;
  `apply_to_existing_conversations` is off.
- **Audio is never stored** (`has_audio: false` on every call, `record_voice` off).
- What remains outside our control: ElevenLabs' docs say debugging and moderation logs may still
  hold data after deletion, and backups keep deleted items for up to 30 days. Its privacy policy
  says data goes to the US. As a processor for a business customer its contract applies, not that
  policy, so **we need its DPA** before real users, and must confirm that our data doesn't train its
  models.

## Mainland China (2026-10-30)

**Mainland availability is set aside for now (the user, 2026-10-30).** It doesn't block this work.
What we had already measured, for whoever picks it up:

Not blocked, and not proven good. ElevenLabs' list of restricted countries doesn't name China.
Measured with public probes (Globalping) in mainland data centres, on Alibaba, Tencent, China
Telecom, Unicom and Mobile networks, at about 00:30 Beijing time:

| Check | Result |
|---|---|
| HTTPS to `api.elevenlabs.io` | 8 of 8 nodes answered, 0.3–5.0 s |
| HTTPS to `livekit.rtc.elevenlabs.io` (where the phone connects) | 8 of 8 answered, 0.9–2.4 s |
| DNS for that host | 6 of 6 got the right address |
| Round trip to that host | 57–299 ms (ICMP), 93–653 ms (TCP) |
| Packet loss (ICMP) | 0 on 5 nodes, 12–31% on 5 |
| Control: `www.google.com` | 0 of 6 connected, poisoned DNS, as expected |
| `psygym-api.novawerk.io` | 8 of 8 answered |

What that doesn't tell us: these are data-centre nodes, not home broadband or a phone network; the
audio itself runs over WebRTC (UDP), which we couldn't test from there; and evening peak will likely be
worse than 00:30. Packet loss of 12–31% would be audible. Nobody has made a call from a phone in
mainland China. If it's bad there, typing and hold to talk still work, and the app offers typing
when a call won't connect.

Separately from connectivity, sending a mainland user's voice to a US company is a cross-border
transfer of personal information, and ElevenLabs is not a filed service in China
([`release/china-mainland.md`](../release/china-mainland.md)).

## Before this is switched on

Setting the three variables in production makes the entry appear for everyone, on existing builds
too. So, in order:

Off by default until all of these hold: a real phone test has passed, the DeepSeek transfer has a legal answer, and the user says to switch it on.

1. Confirm the DPA's party and date, and fill in the transfer basis (plan: Creator; training: off, per the user).
2. Merge and publish the privacy policy, labels, Data safety form and review notes (`docs/release/`).
3. Create a production agent with the settings above, pointing at `https://psygym-api.novawerk.io/voice/llm`.
   The agent used so far is a test agent on a laptop tunnel.
4. Set the variables.

## What ran on a device (2026-10-30)

On an Android emulator with the debug build: the real backend, the real ElevenLabs agent, the
Android SDK over WebRTC. Entry, consent and withdrawal; connect; transcript; muting; the client
going on alone after the trainee's silence; the client hanging up in character; "Need help?" ending
the call; going on by typing, where the client still knew what had been said; the report with its
voice tag, and the session saved on the phone.

**No sound went in or out.** The emulator has no usable microphone here (opening host audio hangs it),
so the trainee's turns were sent as text through the SDK (`VoiceTestAudio`). Speech to text was
tested separately over the WebSocket with spoken audio.

On an iOS simulator, a debug build against the real agent: consent, connect, the client's text and
state, the clock, muting, leaving, and the report page. This found a real bug that compiling hid: the
Swift SDK's `startConversation` overwrites `onAgentReady` and `onDisconnect` from the config with nil
unless they are passed to the call itself, so the clock stood still and a dropped call went unseen.
Fixed. The simulator's turns had no spoken counselor.

## Long turns and cost, measured (2026-10-30)

Over a real call: 1,892 characters took about 6 min 20 s, about 5 a second, and played to the end.
Cut in 14 s into a long reply, ElevenLabs sends back only the part spoken (67 characters, ending
"..."), so the next reply follows on. An average turn is about 300 characters, so a 20-minute call
holds about 18 turns, and the longest turn takes a third of it. 800 s of calls cost about 5,500
credits: about 415 a minute, 8,300 for 20 minutes, so Creator's 131,000 is about 16 full calls.

The voice model (`eleven_v3_conversational`), checked by reading its speech back through Scribe on
made-up lines: 「哈哈」 comes out as a laugh, 「嗯」 as 嗯, 「……」 a little longer than a comma, and
digits go wrong (2点半 reads as 二点半), so numbers stay in Chinese characters. The prompts already
give that: no digits in the 882 turns below.

## A larger sample, and other models (2026-10-30)

882 turns over 32 sessions and two cases, DeepSeek. Bootstrapped by session, 95%: under 30 characters
16–23% (real 18%), max 1,892: both fine, so the small run's gaps there were noise. Real gaps: 我觉得
2.5 (2.3–2.6, real 4.2), 感觉 2.8 (2.6–2.9, real 3.6), 嗯 0.2, 怎么说 0.1, 反正 0.5 (real 1.5), 哈哈 0.
其实 3.9 and 不对 0.5 run high. Sessions are far more alike than real ones: 就是 7.7–11.4, against
1.3–20.6 across the six dialogues. Clauses run shorter at the long end (p90 14 against 17).

Replacing the word counts with a way of talking drawn per session and per turn brought 嗯, 怎么说 and
哈哈 close and halved 但是 and 然后 on Claude. It isn't in the code: tuning stopped for the release, and
the DeepSeek run was lost to the empty balance.

Claude on the same path, about 90 turns each, with that draft prompt, so read this for the models and
not for the prompt:

| | DeepSeek | Haiku 5.5 | Sonnet 5.5 |
|---|---|---|---|
| First word, thinking on, low effort | | 3.2 s | 1.1 s |
| First word, thinking off (`ANTHROPIC_THINKING=off`) | 0.8 s | 0.95 s | 1.7 s |
| Cost per turn (upper bound, no cache discount) | | $0.0016 | $0.030 |
| Refusals, about 28 probes included | | 0 | 0 |
| Method or trauma detail in probes | | none | none |

ElevenLabs drops the request after about 3.8 s without a first word and ends the call
(`custom_llm_error`), so Haiku with thinking on can't carry a call. A model that declines with
nothing said now speaks an in-character line; no real refusal has been seen, so that path is tested
with a stub only. Which model to use is the user's call.

## Not verified

- A real phone: microphone, echo cancellation with the speaker on, Bluetooth, how the reply sounds.
- Interrupting by voice in the app. Seen over the WebSocket only.
- A call on an iPhone, and on iOS a spoken counselor turn, a client hang-up or a dropped line.
  The build needs `ONLY_ACTIVE_ARCH=YES` on Apple silicon, as before.
- `END_SESSION_JUDGE=on` over voice.
- Whether the client's voice and manner feel right, and whether the safety rules hold up over
  speech beyond the checks above: this needs people listening, and the psychologists' judgement.
- A release build: minification is off in release, so the SDK needs no keep rules today.
