import { error, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { dev } from '$app/environment';
import { verifyAccessJwt, type AccessUser } from '$lib/server/access';
import { ensureBootstrap } from '$lib/server/bootstrap';
import { timingSafeEqual } from '$lib/server/crypto';
import { createDb } from '$lib/server/db';

const DEV_USER: AccessUser = {
	sub: 'dev-user',
	email: 'dev@localhost',
	name: 'Dev User'
};

const CRON_USER: AccessUser = {
	sub: 'cron',
	email: 'cron@vigiltra',
	name: 'Cron'
};

function isCronRequest(event: Parameters<Handle>[0]['event']): boolean {
	if (!event.url.pathname.startsWith('/__cron')) return false;
	const provided = event.request.headers.get('x-cron-secret');
	const expected = event.platform?.env.CRON_SECRET;
	if (!expected || !provided) return false;
	return timingSafeEqual(provided, expected);
}

const handleAccess: Handle = async ({ event, resolve }) => {
	if (dev) {
		event.locals.user = DEV_USER;
		return resolve(event);
	}

	if (isCronRequest(event)) {
		event.locals.user = CRON_USER;
		return resolve(event);
	}

	const env = event.platform?.env;
	if (!env?.ACCESS_AUD || !env?.ACCESS_TEAM_DOMAIN) {
		throw error(500, 'Cloudflare Access is not configured');
	}

	const token = event.request.headers.get('Cf-Access-Jwt-Assertion');
	if (!token) throw error(401, 'Missing Cloudflare Access token');

	try {
		event.locals.user = await verifyAccessJwt(token, {
			audience: env.ACCESS_AUD,
			teamDomain: env.ACCESS_TEAM_DOMAIN
		});
	} catch {
		throw error(401, 'Invalid Cloudflare Access token');
	}

	return resolve(event);
};

const handleDb: Handle = async ({ event, resolve }) => {
	const d1 = event.platform?.env.DB;
	if (!d1) throw error(500, 'D1 binding not available');

	const db = createDb(d1);
	event.locals.db = db;
	await ensureBootstrap(db);

	return resolve(event);
};

export const handle = sequence(handleAccess, handleDb);
