// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { AccessUser } from '$lib/server/access';
import type { Db } from '$lib/server/db';

declare global {
	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		interface Locals {
			user: AccessUser;
			db: Db;
		}

		// interface Error {}
		// interface PageData {}
		// interface PageState {}
	}

	namespace Cloudflare {
		interface Env {
			GRAPH_TENANT_ID: string;
			GRAPH_CLIENT_ID: string;
			GRAPH_CLIENT_SECRET: string;
			ACCESS_AUD: string;
			ACCESS_TEAM_DOMAIN: string;
			CRON_SECRET: string;
			SEND_EMAIL?: SendEmail;
		}
	}
}

export {};
