# 0005 — Practice history lives on the phone

Date: 2026-10-10. Status: accepted. Waiting for a look from the 聆镜 (Lingjing) team (see below).

- **What.** The app keeps each finished session on the device: the case id, start and end time,
  the messages, the supervision report and its skill tags. On by default. Users can turn it off
  and delete one session or all of them. Nothing is uploaded or synced. Our server still stores
  no transcript.
- **Why.** Practice history, tapping a quote to jump to that line, practice goals and skill
  progress all need past sessions. Without them, a session is gone the moment the report closes,
  and there is little reason to come back. See
  [`product/open-decisions.md`](../product/open-decisions.md) D3.
- **Options we weighed.**
  - Store nothing (old behaviour): simplest, least risk, but no history or progress.
  - **Store on the phone, on by default (chosen):** history and progress work; the data stays
    with the user; no account, no cloud.
  - Store on the phone, off by default: safest, but few people would turn it on.
  - Store in the cloud with an account: breaks "the server stores no transcript", needs accounts
    and a privacy review (PIPL sensitive data, GDPR Art. 9). Not now.
- **Risks we accept.** Someone with the unlocked phone can read past sessions. If a user breaks
  the rule and types real client details, those stay on the phone until deleted.
- **Requirements.**
  - Tell the user before the first save: one line on the end-session sheet ("对话和报告会存在这台
    手机上") and the switch under 「我的」 (Me).
  - 「我的」 (Me): a switch "在本机保存练习记录" (on by default; off stops new saves, keeps old ones),
    "删除所有练习记录" with a confirm step. Each session can be deleted from the history list
    and its detail page.
  - Android: keep `allowBackup="false"`. iOS: store in a directory excluded from iCloud and
    device backups (Application Support with `isExcludedFromBackup`, not Documents).
  - Uninstalling the app deletes everything.
  - Update the text that says we store nothing: [`safety.md`](../safety.md) §1, the privacy page
    (P3) and [`product/copy.md`](../product/copy.md), the app README and code comments.
- **Open.** Encryption at rest (key in Keychain / Keystore): to be decided. Without it, the
  privacy page says plainly that records are stored unencrypted in the app's private storage.
- **聆镜 to check.** Is it acceptable, from a clinical-training view, that practice transcripts
  stay on the trainee's own phone? We ask in [`for-psygym-team.md`](../for-psygym-team.md).
