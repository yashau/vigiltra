import { fail, type Actions } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import {
	globalConfig,
	notificationChannels,
	thresholdTemplates,
	toPublicChannel
} from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform }) => {
	const [templates, channelRows, [config]] = await Promise.all([
		locals.db.select().from(thresholdTemplates).orderBy(asc(thresholdTemplates.name)),
		locals.db.select().from(notificationChannels).orderBy(asc(notificationChannels.name)),
		locals.db.select().from(globalConfig).where(eq(globalConfig.id, 1)).limit(1)
	]);
	const channels = channelRows.map(toPublicChannel);

	const env = platform?.env;
	const diagnostics = {
		graph: !!(env?.GRAPH_TENANT_ID && env?.GRAPH_CLIENT_ID && env?.GRAPH_CLIENT_SECRET),
		access: !!(env?.ACCESS_AUD && env?.ACCESS_TEAM_DOMAIN),
		cron: !!env?.CRON_SECRET,
		email: !!env?.SEND_EMAIL
	};

	return {
		templates,
		channels,
		defaultTemplateId: config?.defaultTemplateId ?? null,
		globalChannelIds: config?.globalChannelIds ?? [],
		diagnostics
	};
};

export const actions: Actions = {
	updateDefaults: async ({ request, locals }) => {
		const form = await request.formData();
		const defaultTemplateId = String(form.get('defaultTemplateId') ?? '');
		const channelIds = form.getAll('globalChannelIds').map((v) => String(v));

		if (!defaultTemplateId) return fail(400, { error: 'Default template is required' });

		const [template] = await locals.db
			.select()
			.from(thresholdTemplates)
			.where(eq(thresholdTemplates.id, defaultTemplateId))
			.limit(1);
		if (!template) return fail(400, { error: 'Selected default template does not exist' });

		if (channelIds.length > 0) {
			const rows = await locals.db
				.select({ id: notificationChannels.id })
				.from(notificationChannels);
			const known = new Set(rows.map((r) => r.id));
			for (const id of channelIds) {
				if (!known.has(id)) return fail(400, { error: `Unknown channel id: ${id}` });
			}
		}

		await locals.db
			.update(globalConfig)
			.set({ defaultTemplateId, globalChannelIds: channelIds })
			.where(eq(globalConfig.id, 1));

		return { success: true };
	}
};
