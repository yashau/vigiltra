import { error, json } from '@sveltejs/kit';
import { timingSafeEqual } from '$lib/server/crypto';
import { runDigest } from '$lib/server/notifications/digest';
import { refreshGraphCache } from '$lib/server/graph/refresh';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	const env = platform?.env;
	if (!env) throw error(500, 'Platform env unavailable');

	const provided = request.headers.get('x-cron-secret');
	if (!env.CRON_SECRET || !provided || !timingSafeEqual(provided, env.CRON_SECRET)) {
		throw error(401, 'Invalid cron secret');
	}

	const refreshErrors: string[] = [];
	try {
		await refreshGraphCache(locals.db, {
			GRAPH_TENANT_ID: env.GRAPH_TENANT_ID,
			GRAPH_CLIENT_ID: env.GRAPH_CLIENT_ID,
			GRAPH_CLIENT_SECRET: env.GRAPH_CLIENT_SECRET
		});
	} catch (err) {
		refreshErrors.push(err instanceof Error ? err.message : String(err));
	}

	const digest = await runDigest(locals.db, {
		SEND_EMAIL: env.SEND_EMAIL
	});

	return json({
		refresh: { ok: refreshErrors.length === 0, errors: refreshErrors },
		digest
	});
};
