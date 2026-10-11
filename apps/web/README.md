# apps/web — psygym.novawerk.io

The 聆镜 PSYGYM website: home, privacy notice, account deletion. Chinese and English. The spec
is [`docs/product/landing.md`](../../docs/product/landing.md); the design is row ⑨ of the app
design canvas.

- **Astro, static.** Three pages, no client framework. The only scripts are a few inline lines:
  the bare paths (`/`, `/privacy`, `/delete-account`) pick `/zh/…` or `/en/…`, and the 中 | EN
  switch remembers the choice in `localStorage` (key `lang`).
- **No tracking.** No analytics, no cookies, nothing loaded from another host. The font (Noto
  Sans SC) is served from this site by `@fontsource-variable/noto-sans-sc`.
- **The privacy page is the policy file.** `/privacy` renders
  [`docs/release/privacy-policy.md`](../../docs/release/privacy-policy.md) at build time. Edit
  that file, not the site.
- Copy lives in `src/lib/i18n.ts`, word for word from the spec.

```bash
pnpm --filter web dev     # http://localhost:4321
pnpm --filter web test    # builds, then checks dist/
```

**Vercel:** its own project. Root directory `apps/web`, install `pnpm install --frozen-lockfile`,
build `pnpm build`, output `dist` (all in `vercel.json`). The share images `public/og-*.png` are
drawn from the design; redraw them when the headline changes.
