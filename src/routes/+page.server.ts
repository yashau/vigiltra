import { error, fail, type Actions } from '@sveltejs/kit';
import { asc, eq, sql } from 'drizzle-orm';
import {
	appRegistrations,
	appRegOverrides,
	credentials,
	notificationChannels,
	refreshStatus,
	thresholdTemplates,
	toPublicChannel,
	type Credential,
	type PublicNotificationChannel
} from '$lib/server/db/schema';
import { refreshGraphCache } from '$lib/server/graph/refresh';
import type { PageServerLoad } from './$types';

const REFRESH_MIN_INTERVAL_MS = 60_000;

function sanitizeRefreshError(message: string): string {
	const trimmed = message.length > 200 ? `${message.slice(0, 200)}…` : message;
	return trimmed.replace(/[A-Fa-f0-9-]{16,}/g, '<redacted>');
}

export type AppRow = {
	objectId: string;
	appId: string;
	displayName: string;
	kind: 'app_registration' | 'enterprise_app';
	hasSamlSso: boolean;
	preferredSigningKeyThumbprint: string | null;
	createdDateTime: Date | null;
	refreshedAt: Date;
	monitoringEnabled: boolean;
	templateId: string | null;
	channelOverrideIds: string[] | null;
	credentials: Credential[];
	soonestExpiry: Date | null;
};

export const load: PageServerLoad = async ({ locals }) => {
	const { db } = locals;

	const [status] = await db
		.select()
		.from(refreshStatus)
		.where(eq(refreshStatus.id, 1))
		.limit(1);

	const apps = await db
		.select({
			objectId: appRegistrations.objectId,
			appId: appRegistrations.appId,
			displayName: appRegistrations.displayName,
			kind: appRegistrations.kind,
			hasSamlSso: appRegistrations.hasSamlSso,
			preferredSigningKeyThumbprint: appRegistrations.preferredSigningKeyThumbprint,
			createdDateTime: appRegistrations.createdDateTime,
			refreshedAt: appRegistrations.refreshedAt,
			monitoringEnabled: appRegOverrides.monitoringEnabled,
			templateId: appRegOverrides.templateId,
			channelOverrideIds: appRegOverrides.channelOverrideIds
		})
		.from(appRegistrations)
		.leftJoin(appRegOverrides, eq(appRegistrations.objectId, appRegOverrides.appObjectId))
		.orderBy(asc(appRegistrations.displayName));

	const allCreds = await db.select().from(credentials);
	const credsByApp = new Map<string, Credential[]>();
	for (const c of allCreds) {
		const arr = credsByApp.get(c.appObjectId) ?? [];
		arr.push(c);
		credsByApp.set(c.appObjectId, arr);
	}

	const rows: AppRow[] = apps.map((a) => {
		const creds = (credsByApp.get(a.objectId) ?? []).sort((x, y) => {
			if (x.superseded !== y.superseded) return x.superseded ? 1 : -1;
			return (
				(x.endDateTime?.getTime() ?? Infinity) - (y.endDateTime?.getTime() ?? Infinity)
			);
		});
		const activeCreds = creds.filter((c) => !c.superseded);
		const soonestExpiry = activeCreds.length > 0 ? activeCreds[0].endDateTime : null;
		return {
			objectId: a.objectId,
			appId: a.appId,
			displayName: a.displayName,
			kind: a.kind,
			hasSamlSso: a.hasSamlSso,
			preferredSigningKeyThumbprint: a.preferredSigningKeyThumbprint,
			createdDateTime: a.createdDateTime,
			refreshedAt: a.refreshedAt,
			monitoringEnabled: a.monitoringEnabled ?? true,
			templateId: a.templateId ?? null,
			channelOverrideIds: a.channelOverrideIds ?? null,
			credentials: creds,
			soonestExpiry
		};
	});

	rows.sort((a, b) => {
		const at = a.soonestExpiry?.getTime() ?? Infinity;
		const bt = b.soonestExpiry?.getTime() ?? Infinity;
		return at - bt;
	});

	const [templates, channelRows] = await Promise.all([
		db.select().from(thresholdTemplates).orderBy(asc(thresholdTemplates.name)),
		db.select().from(notificationChannels).orderBy(asc(notificationChannels.name))
	]);
	const channels: PublicNotificationChannel[] = channelRows.map(toPublicChannel);

	const safeStatus = status
		? {
				...status,
				lastRefreshError: status.lastRefreshError
					? sanitizeRefreshError(status.lastRefreshError)
					: null
			}
		: null;

	return { rows, status: safeStatus, templates, channels };
};

export const actions: Actions = {
	refresh: async ({ locals, platform }) => {
		const env = platform?.env;
		if (!env?.GRAPH_TENANT_ID || !env?.GRAPH_CLIENT_ID || !env?.GRAPH_CLIENT_SECRET) {
			throw error(500, 'Graph credentials are not configured');
		}
		const [status] = await locals.db
			.select()
			.from(refreshStatus)
			.where(eq(refreshStatus.id, 1))
			.limit(1);
		if (status?.lastRefreshStatus === 'pending' && status.lastRefreshStartedAt) {
			const ageMs = Date.now() - status.lastRefreshStartedAt.getTime();
			if (ageMs < REFRESH_MIN_INTERVAL_MS) {
				return fail(429, { error: 'A refresh is already running.' });
			}
		} else if (status?.lastRefreshStartedAt) {
			const ageMs = Date.now() - status.lastRefreshStartedAt.getTime();
			if (ageMs < REFRESH_MIN_INTERVAL_MS) {
				const wait = Math.ceil((REFRESH_MIN_INTERVAL_MS - ageMs) / 1000);
				return fail(429, { error: `Slow down — try again in ${wait}s.` });
			}
		}
		try {
			await refreshGraphCache(locals.db, {
				GRAPH_TENANT_ID: env.GRAPH_TENANT_ID,
				GRAPH_CLIENT_ID: env.GRAPH_CLIENT_ID,
				GRAPH_CLIENT_SECRET: env.GRAPH_CLIENT_SECRET
			});
			return { success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return fail(500, { error: sanitizeRefreshError(message) });
		}
	},

	toggleMonitoring: async ({ request, locals }) => {
		const form = await request.formData();
		const objectId = String(form.get('objectId') ?? '');
		const appId = String(form.get('appId') ?? '');
		const enabled = form.get('enabled') === 'true';
		if (!objectId || !appId) return fail(400, { error: 'Missing objectId/appId' });

		const [app] = await locals.db
			.select({ objectId: appRegistrations.objectId })
			.from(appRegistrations)
			.where(eq(appRegistrations.objectId, objectId))
			.limit(1);
		if (!app) return fail(404, { error: 'App registration not found' });

		await locals.db
			.insert(appRegOverrides)
			.values({ appObjectId: objectId, appId, monitoringEnabled: enabled })
			.onConflictDoUpdate({
				target: appRegOverrides.appObjectId,
				set: { monitoringEnabled: enabled, updatedAt: sql`(unixepoch())` }
			});
		return { success: true };
	},

	saveOverride: async ({ request, locals }) => {
		const form = await request.formData();
		const objectId = String(form.get('objectId') ?? '');
		const appId = String(form.get('appId') ?? '');
		const rawTemplateId = String(form.get('templateId') ?? '');
		const useCustomChannels = form.get('useCustomChannels') === 'true';
		const channelIds = form.getAll('channelIds').map((v) => String(v));

		if (!objectId || !appId) return fail(400, { error: 'Missing objectId/appId' });

		const [app] = await locals.db
			.select({ objectId: appRegistrations.objectId })
			.from(appRegistrations)
			.where(eq(appRegistrations.objectId, objectId))
			.limit(1);
		if (!app) return fail(404, { error: 'App registration not found' });

		const templateId = rawTemplateId === '' ? null : rawTemplateId;
		if (templateId) {
			const [t] = await locals.db
				.select({ id: thresholdTemplates.id })
				.from(thresholdTemplates)
				.where(eq(thresholdTemplates.id, templateId))
				.limit(1);
			if (!t) return fail(400, { error: 'Template not found' });
		}

		if (useCustomChannels && channelIds.length > 0) {
			const rows = await locals.db
				.select({ id: notificationChannels.id })
				.from(notificationChannels);
			const known = new Set(rows.map((r) => r.id));
			for (const id of channelIds) {
				if (!known.has(id)) return fail(400, { error: `Unknown channel id: ${id}` });
			}
		}

		const channelOverrideIds = useCustomChannels ? channelIds : null;

		await locals.db
			.insert(appRegOverrides)
			.values({
				appObjectId: objectId,
				appId,
				templateId,
				channelOverrideIds
			})
			.onConflictDoUpdate({
				target: appRegOverrides.appObjectId,
				set: {
					templateId,
					channelOverrideIds,
					updatedAt: sql`(unixepoch())`
				}
			});

		return { success: true };
	}
};
