# Vigiltra — project guide for Claude

Single-tenant Microsoft Entra credential-expiry monitor. SvelteKit + Svelte 5 + Cloudflare Workers + D1 + Drizzle. See [README.md](README.md) for setup/deploy; this file is repo-level guidance for code changes.

## Commands

- `pnpm dev` — local dev server (Cloudflare Access is bypassed, uses synthetic Dev User)
- `pnpm check` — wrangler types + svelte-check. Run after any schema or route change.
- `pnpm run deploy` — build and push to Cloudflare. `pnpm deploy` alone hits pnpm's built-in command; always use `pnpm run deploy`.
- `pnpm db:generate` — regenerate SQL migration from `schema.ts`
- `pnpm db:migrate:remote` / `--local` — apply migrations

## Repo layout

- [src/hooks.server.ts](src/hooks.server.ts) — Access JWT verification, DB binding, bootstrap
- [src/routes/](src/routes/) — SvelteKit pages (`+page.svelte` + `+page.server.ts`) for apps list, channels, templates, settings
- [src/routes/__cron/+server.ts](src/routes/__cron/+server.ts) — daily digest endpoint (secret-gated)
- [src/lib/server/db/schema.ts](src/lib/server/db/schema.ts) — Drizzle schema; source of truth for all tables
- [src/lib/server/graph/](src/lib/server/graph/) — Graph client, token, refresh pipeline
- [src/lib/server/notifications/](src/lib/server/notifications/) — digest runner, schedule logic, email + telegram dispatch
- [src/lib/components/](src/lib/components/) — shadcn-svelte components and app-specific dialogs
- [drizzle/](drizzle/) — generated SQL migrations + meta (do not hand-edit)

## Conventions

- **Svelte 5 runes only**: `$state`, `$derived`, `$props`, `$effect`. No legacy `export let` or reactive `$:`.
- **shadcn-svelte** for all primitives — install via the real CLI (`pnpm dlx shadcn-svelte@latest add ...`). Do not write Tailwind components from scratch.
- **Dark mode** is class-based via `mode-watcher` (toggles `.dark` on `<html>`). Do not use `@media (prefers-color-scheme)` or Tailwind's `media` strategy.
- **Drizzle**: snake_case column names are generated automatically; write camelCase in JS. Use `db.batch([...])` for atomic multi-statement operations (it's the only transaction primitive D1 exposes).
- **File references in UI/errors**: use markdown links (`[file.ts](path/file.ts)`) not backticks.

## Gotchas

- **D1 variable limit is ~100 per statement.** Large inserts must chunk: `app_registrations` chunks at 10 rows (80 vars), `credentials` at 8 rows (88 vars). Adding columns to either table requires lowering these.
- **`wrangler.jsonc` is gitignored.** It holds the account_id and D1 ID. Never commit it; if you need a new clone, hand-create it from the README template.
- **`kind` enum is `'app_registration' | 'enterprise_app'`.** SAML-ness lives on `has_saml_sso`, not on `kind`. An app registration with SAML SSO has both a matching `/applications` entry and a SAML service principal — the refresh pipeline merges them by `appId`.
- **Preferred SAML signing cert** is matched against `keyCredentials[].keyId` OR `customKeyIdentifier` (base64 of the thumbprint bytes → hex). See `isPreferredSamlCert` in [+page.svelte](src/routes/+page.svelte).
- **Superseded credentials** are computed at refresh time per app: within each kind, any credential with an `endDateTime` earlier than the latest same-kind sibling is marked `superseded = true`. The digest skips them and the UI strikes them through. Don't re-introduce notifications for superseded rows.
- **Credential PK** is `(appObjectId, keyId)`. Microsoft Graph doesn't guarantee keyId uniqueness across `passwordCredentials` and `keyCredentials` on the same object — [refresh.ts](src/lib/server/graph/refresh.ts) dedups per app before insert.
- **Refresh atomicity**: `delete credentials → delete apps → insert chunks → update refresh_status` all runs inside one `db.batch()`. Don't break this up — partial state would show stale rows.
- **Error sanitization**: `sanitizeRefreshError` in [+page.server.ts](src/routes/+page.server.ts) redacts long hex/UUID strings before they hit the browser. New error paths that surface messages to the UI should reuse it.
- **Cloudflare Access AUD**: 64-char hex on the Access application → **Additional settings** tab → **AUD tag** chip.

## Bootstrap

[src/lib/server/bootstrap.ts](src/lib/server/bootstrap.ts) seeds the three built-in threshold templates, the `global_config` singleton, and the `refresh_status` singleton on first request (idempotent, memoized per `Db` instance). Don't remove; there's no separate seed migration.

## Testing changes end-to-end

1. `pnpm check` — catches type errors from schema drift
2. `pnpm dev` — verify UI renders and form actions work against local D1
3. `pnpm run deploy` — push to Cloudflare
4. Hit the live URL, click **Refresh now**, verify the apps list populates and the last-refresh timestamp updates

For schema changes on a greenfield DB: regenerate migration (delete old `.sql` + snapshot + journal entry, then `pnpm db:generate`), drop tables on remote via `wrangler d1 execute`, then `pnpm db:migrate:remote`.
