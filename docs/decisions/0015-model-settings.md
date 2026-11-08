# 0015 — Model settings in the admin

Date: 2026-11-08. Status: **accepted** (the user, 2026-11-08: "Yes, build it").

## Why

The project owner wants to put in their own Claude key, and choose the model, without asking us
to edit Vercel and redeploy. Until now every model setting lived in environment variables
(`ANTHROPIC_API_KEY`, `CLIENT_LLM_*`, `SUPERVISOR_LLM_*`). Only we could change them.

## Decision

A page in the admin, 「模型设置」, for role `admin` (any org).

- **Keys.** An admin pastes a Claude key (and a DeepSeek key, where DeepSeek is allowed). The
  server encrypts it with `MODEL_SETTINGS_SECRET` (AES-256-GCM) before it reaches the database.
  The key never leaves the server again: the page shows its last four characters. Logs and the
  change log never hold it.
- **Models.** Per role (AI client, AI supervisor): the provider and the model name. Empty model:
  the provider's default.
- **On top of the environment.** What the admin left empty, the environment decides, exactly as
  before. "Back to default" removes the admin's choice. With nothing stored, nothing changes.
- **Checked before saving.** Every role whose config changes, and every new key, gets one
  1-token call with that key and model. A wrong key, a misspelt model or an empty balance is a
  422 with the reason, and nothing is saved. 20 checked saves per admin per hour.
- **Live within a minute.** Each instance reloads the settings in the background every 60 s, like
  the published content. The instance that saved loads them at once. No redeploy.
- **DeepSeek is off in production** (`MODEL_SETTINGS_ALLOW_DEEPSEEK` unset). The consent text in
  the app, the privacy policy and the store privacy labels all say conversations go to Anthropic
  in the US. DeepSeek would send them to China: that needs a new consent from every user, new
  policy text and labels, and a legal basis for the transfer out of the EU. The page says so. A
  stored DeepSeek choice is ignored if the flag is later turned off.
- **Who changed what.** Each save writes a line: when, who, what changed (key hints only).

## Details

- Tables `model_settings` (one row, id `current`) and `model_settings_log`, migration
  `0003_model_settings`.
- Off unless `ADMIN_MODE=on` and `MODEL_SETTINGS_SECRET` (32+ characters) are set. Off: the page
  says so and can't save; the app uses the environment.
- Changing `MODEL_SETTINGS_SECRET` makes stored keys unreadable: they are ignored (log line) and
  the environment's keys are used until an admin enters them again.
- Voice sessions use the AI client's setting, like text sessions.
- API: `GET /admin/model-settings`, `PUT /admin/model-settings` ([admin-api.md](../admin-api.md)).
  Code: `apps/api/src/model-settings.ts`, `model-settings-db.ts`, `model-check.ts`.
