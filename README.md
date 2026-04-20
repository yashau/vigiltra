# Vigiltra

A single-tenant Microsoft Entra credential-expiry monitor. Vigiltra fetches every app registration and SAML enterprise app from Microsoft Graph, caches them in Cloudflare D1, and sends a daily digest to your notification channels before secrets or signing certificates expire.

Runs as a SvelteKit app on a Cloudflare Worker. No servers to patch, no cron box, no database to back up.

## What it tracks

- **App registration client secrets** (`passwordCredentials`)
- **App registration certificates** (`keyCredentials`)
- **SAML enterprise app signing certificates** (`servicePrincipals` with `preferredSingleSignOnMode eq 'saml'`). Merged into their matching app registration by `appId`, with the preferred signing cert marked in the UI.
- **Superseded credentials**: when a provider adds a new certificate without deleting the old one, Vigiltra flags the older one as superseded and suppresses its notifications.

## Architecture

| Layer              | Tech                                                 |
| ------------------ | ---------------------------------------------------- |
| Runtime            | Cloudflare Workers (paid plan required for D1 + cron) |
| Framework          | SvelteKit 2 + Svelte 5 (runes) + `@sveltejs/adapter-cloudflare` |
| Database           | Cloudflare D1 (SQLite) via Drizzle ORM              |
| Auth               | Cloudflare Access (Entra IdP) — JWT verified per request |
| Email              | Cloudflare Email Workers (`send_email` binding)      |
| Telegram           | Bot HTTP API                                          |
| Graph auth         | Client-credentials flow (separate Entra app with `Application.Read.All`) |
| Cron               | Workers Cron Triggers → `/__cron` endpoint           |

## Prerequisites

- Cloudflare account on the **Workers Paid** plan (D1 + cron triggers)
- A custom domain in Cloudflare (for Access to work; `*.workers.dev` URLs can't be protected by Access)
- A Microsoft Entra tenant where you can create app registrations and grant admin consent
- `pnpm` ≥ 9 and Node ≥ 20 locally

## Setup

### 1. Clone and install

```sh
git clone <this repo>
cd vigiltra
pnpm install
```

### 2. Create the D1 database

```sh
pnpm wrangler d1 create vigiltra-db
```

Copy the returned `database_id` — you'll need it in `wrangler.jsonc`.

### 3. Create `wrangler.jsonc`

`wrangler.jsonc` is gitignored because it pins your Cloudflare account and D1 IDs. Create it from this template.

> ⚠ `workers_dev` and `preview_urls` are both `false`. Cloudflare Access can only protect your **custom domain** route — the default `<worker>.<account>.workers.dev` hostname and preview URLs bypass Access entirely, exposing the whole app unauthenticated. Leave both off. (If you've already deployed once with them enabled, also disable them in the dashboard: **Workers & Pages** → the worker → **Settings** → **Domains & Routes** → disable the `workers.dev` subdomain and preview URLs.)

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "vigiltra",
  "account_id": "<YOUR_CLOUDFLARE_ACCOUNT_ID>",
  "compatibility_date": "2026-04-20",
  "compatibility_flags": ["nodejs_als"],
  "main": ".svelte-kit/cloudflare/_worker.js",
  "assets": {
    "binding": "ASSETS",
    "directory": ".svelte-kit/cloudflare"
  },
  "workers_dev": false,
  "preview_urls": false,
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "vigiltra-db",
      "database_id": "<FROM_STEP_2>",
      "migrations_dir": "./drizzle"
    }
  ],
  "send_email": [{ "name": "SEND_EMAIL" }],
  "triggers": {
    // Daily at 09:00 UTC — refresh Graph cache, then send notification digest
    "crons": ["0 9 * * *"]
  }
}
```

### 4. Apply database migrations

```sh
pnpm wrangler d1 migrations apply vigiltra-db --remote
```

For local development:

```sh
pnpm wrangler d1 migrations apply vigiltra-db --local
```

### 5. Create the Microsoft Graph reader app

In Entra admin center → **App registrations** → **New registration**:

1. Name: `Vigiltra Graph Reader`
2. Single tenant
3. No redirect URI

Then:

1. **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions** → add **`Application.Read.All`**. Remove the default delegated `User.Read`. Click **Grant admin consent**.
2. **Certificates & secrets** → **New client secret**. Copy the **Value** (not the ID).
3. **Overview** → copy the **Directory (tenant) ID** and **Application (client) ID**.

### 6. Create the Cloudflare Access application

1. In the Cloudflare dashboard, add your custom domain and create a route for the Worker (e.g. `vigiltra.example.com`).
2. **Zero Trust** → **Access** → **Applications** → **Add an application** → **Self-hosted**.
3. Application domain: your route from step 1.
4. Identity provider: add **Entra ID (OIDC)** with a second Entra app registration using delegated `openid profile email` scopes. (This is separate from the Graph reader.)
5. Create an Access policy that allows your users.
6. Open **Configure** on the application → **Basic information** → copy the **AUD tag** (64-char hex).
7. Note your team domain (e.g. `acme.cloudflareaccess.com`).

### 7. Set production secrets

Vigiltra reads six Worker secrets. Each is set with `pnpm wrangler secret put <NAME>`, which prompts for the value and stores it encrypted on Cloudflare. Secrets are never bundled into the Worker script.

#### `GRAPH_TENANT_ID`

The Entra tenant (directory) GUID. Used in the OAuth token endpoint URL when Vigiltra requests an access token.

**Where to find it:** Entra admin center → **App registrations** → open the **Graph Reader** app created in step 5 → **Overview** tab → copy **Directory (tenant) ID**.

```sh
pnpm wrangler secret put GRAPH_TENANT_ID
# paste the tenant GUID, e.g. d733d662-fcff-4bbd-82f8-f804202f357e
```

#### `GRAPH_CLIENT_ID`

The Graph reader app's client/application ID.

**Where to find it:** same app's **Overview** tab → **Application (client) ID**.

```sh
pnpm wrangler secret put GRAPH_CLIENT_ID
```

#### `GRAPH_CLIENT_SECRET`

The client secret Vigiltra presents to Entra to obtain an app-only Graph token.

**Where to get it:** in the Graph reader app → **Certificates & secrets** → **Client secrets** tab → **+ New client secret**. Give it a description and an expiry (max 24 months), click **Add**, then **immediately copy the `Value`** (not the `Secret ID`). It will never be shown again — if you miss it, create another one and delete the first.

> ⚠ Set a calendar reminder to rotate this before it expires. Vigiltra can't monitor its own Graph reader secret (the Worker would lose Graph access first).

```sh
pnpm wrangler secret put GRAPH_CLIENT_SECRET
```

#### `ACCESS_AUD`

The 64-character hex "Application Audience" tag. Cloudflare Access signs a JWT with this `aud` claim; Vigiltra's hooks verify it matches before serving any request.

**Where to find it:** Cloudflare dashboard → **Zero Trust** → **Access** → **Applications** → click **Manage** (or **Configure**) on your Vigiltra app → switch to the **Additional settings** tab → click the **AUD tag** chip in the row of setting chips. Copy the **Token** value — a 64-character hex string under "Application Audience (AUD) Tag".

> Note: the AUD tag is *not* the same as the OIDC application ID shown in Entra. It lives only inside Cloudflare.

```sh
pnpm wrangler secret put ACCESS_AUD
```

#### `ACCESS_TEAM_DOMAIN`

Your Cloudflare Zero Trust team domain, used to fetch the JWKS for JWT verification. Format: `<team>.cloudflareaccess.com` (no scheme, no trailing slash).

**Where to find it:** Cloudflare dashboard → **Zero Trust** → **Settings** → **Custom Pages** (or **General**) → the **Team domain** field. Example: `acme.cloudflareaccess.com`.

```sh
pnpm wrangler secret put ACCESS_TEAM_DOMAIN
# e.g. acme.cloudflareaccess.com
```

#### `CRON_SECRET`

A shared secret the scheduled handler passes to `/__cron` as the `x-cron-secret` header. Prevents anyone from triggering a digest run by POSTing to that URL.

**How to generate:**

```sh
openssl rand -hex 32
```

Then:

```sh
pnpm wrangler secret put CRON_SECRET
# paste the 64-char hex value
```

You don't need to share this with anything — the scheduled handler in the same Worker reads it from `env.CRON_SECRET` and forwards it as the header.

#### Verifying the secrets are set

```sh
pnpm wrangler secret list
```

Should show all six names (values are never displayed).

#### Rotating a secret

Just run `pnpm wrangler secret put <NAME>` again with the new value. The old value is replaced atomically on the next cold start.

### 8. Deploy

```sh
pnpm run deploy
```

Then visit your Access-protected URL and click **Refresh now** to populate the cache.

## Local development

1. Copy `.dev.vars.example` to `.dev.vars` and fill in the same secrets.
2. `pnpm wrangler d1 migrations apply vigiltra-db --local`
3. `pnpm dev`

In dev mode, `hooks.server.ts` bypasses Cloudflare Access and injects a synthetic `Dev User`.

## Commands

| Command                       | What it does                                       |
| ----------------------------- | -------------------------------------------------- |
| `pnpm dev`                    | Vite dev server with HMR                           |
| `pnpm build`                  | Build and wrap the Worker entrypoint               |
| `pnpm run deploy`             | Build + deploy to Cloudflare                       |
| `pnpm check`                  | Type-check (wrangler types + svelte-check)         |
| `pnpm lint`                   | Prettier + ESLint                                  |
| `pnpm format`                 | Prettier --write                                   |
| `pnpm test`                   | Vitest unit tests                                  |
| `pnpm db:generate`            | Regenerate SQL migration from `schema.ts`          |
| `pnpm db:migrate:local`       | Apply migrations to local D1                       |
| `pnpm db:migrate:remote`      | Apply migrations to remote D1                      |
| `pnpm db:studio`              | Open Drizzle Studio                                |

## How it works

### Daily cron

At 09:00 UTC the scheduled handler POSTs to `/__cron` with the `x-cron-secret` header. The endpoint:

1. Calls `refreshGraphCache` — pulls `/applications` and `/servicePrincipals` (SAML-filtered) in parallel, merges them by `appId`, computes `superseded` flags per app, and replaces the cache in a single D1 `batch()` transaction.
2. Calls `runDigest` — loads each monitored app's threshold schedule and notification channels, and sends one combined message per channel.

### Threshold templates

Each template is a `{ fires: number[], notify_past_expiry: boolean }`. `fires` is a list of "days until expiry" values. If a credential's days-until-expiry equals any value in the list, it fires today. Built-in templates: Default, Aggressive, Minimal. Users can create custom templates and pin a default via the Settings page.

### Per-app overrides

Any app can override the default template and/or notification channels. Monitoring can also be toggled off entirely per app.

### Notification channels

- **Email** — sent via Cloudflare's `send_email` binding. `from` must be a verified destination/sender in your account.
- **Telegram** — bot token + chat ID. Test both with the **Send test** button on the Channels page.

### Superseded credential handling

During refresh, for each app Vigiltra finds the latest `endDateTime` among each credential kind (`secret` / `certificate`). Any same-kind credential with an earlier `endDateTime` is stamped `superseded = true`. These are:

- **Skipped** by the digest
- **Rendered with strikethrough** in the UI
- **Excluded** from the "Expiring" and "Expired" filters

This prevents noisy repeat notifications for apps like 3CX that don't delete old signing certs when rotating.

## Schema

Defined in [src/lib/server/db/schema.ts](src/lib/server/db/schema.ts). Migrations live in [drizzle/](drizzle/).

| Table                    | Purpose                                              |
| ------------------------ | ---------------------------------------------------- |
| `app_registrations`      | Graph cache: one row per app (merged across `/applications` and SAML SPs) |
| `credentials`            | Graph cache: secrets + certs, composite PK `(app_object_id, key_id)` |
| `app_reg_overrides`      | Per-app template/channel overrides, monitoring toggle |
| `threshold_templates`    | Notification schedules (built-in + user-created)     |
| `notification_channels`  | Email / Telegram configs                             |
| `global_config`          | Singleton row (id = 1): default template + global channels |
| `notification_runs`      | Per-day digest run log (idempotency + summary)       |
| `refresh_status`         | Singleton row (id = 1): last-refresh metadata        |

## Security

- **Cloudflare Access** protects every request. JWTs are verified against the Access team-domain JWKS (no shared secrets in the hot path).
- **Graph credentials**: stored as Worker secrets, never bundled, never logged. The sanitizer in `+page.server.ts` redacts long hex/UUID strings from error messages shown in the UI.
- **Telegram bot tokens** are never returned to the browser; channel configs are projected through `toPublicChannel` which strips secrets.
- **Cron endpoint** requires a timing-safe comparison of the `x-cron-secret` header against `CRON_SECRET`.

## Troubleshooting

- **`500 Cloudflare Access is not configured`** — the `ACCESS_AUD` or `ACCESS_TEAM_DOMAIN` secret is missing in production.
- **Refresh says "failed" with a Graph 403** — the Graph reader app is missing `Application.Read.All` admin consent.
