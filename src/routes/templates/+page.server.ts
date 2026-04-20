import { fail, type Actions } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import {
	globalConfig,
	thresholdTemplates,
	type ThresholdSchedule
} from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const [templates, [config]] = await Promise.all([
		locals.db.select().from(thresholdTemplates).orderBy(asc(thresholdTemplates.name)),
		locals.db.select().from(globalConfig).where(eq(globalConfig.id, 1)).limit(1)
	]);
	return {
		templates,
		defaultTemplateId: config?.defaultTemplateId ?? null
	};
};

function parseSchedule(
	form: FormData
): { name: string; schedule: ThresholdSchedule } | { error: string } {
	const name = String(form.get('name') ?? '').trim();
	const rawFires = String(form.get('fires') ?? '').trim();
	const notifyPastExpiry = form.get('notify_past_expiry') === 'true';
	if (!name) return { error: 'Name is required' };
	if (!rawFires) return { error: 'Fires list is required' };

	const nums = rawFires
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
		.map(Number);
	if (nums.some((n) => !Number.isFinite(n) || n < 0 || !Number.isInteger(n) || n > 3650)) {
		return {
			error: 'Fires must be a comma-separated list of non-negative integers (max 3650)'
		};
	}
	const fires = Array.from(new Set(nums)).sort((a, b) => b - a);
	if (fires.length > 50) return { error: 'At most 50 fire points are allowed' };
	return { name, schedule: { fires, notify_past_expiry: notifyPastExpiry } };
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const parsed = parseSchedule(form);
		if ('error' in parsed) return fail(400, { error: parsed.error });
		const id = crypto.randomUUID();
		await locals.db.insert(thresholdTemplates).values({
			id,
			name: parsed.name,
			schedule: parsed.schedule,
			isBuiltin: false
		});
		return { success: true };
	},

	update: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const parsed = parseSchedule(form);
		if (!id) return fail(400, { error: 'Missing template id' });
		if ('error' in parsed) return fail(400, { error: parsed.error });

		const [existing] = await locals.db
			.select()
			.from(thresholdTemplates)
			.where(eq(thresholdTemplates.id, id))
			.limit(1);
		if (!existing) return fail(404, { error: 'Template not found' });
		if (existing.isBuiltin) return fail(400, { error: 'Builtin templates cannot be edited' });

		await locals.db
			.update(thresholdTemplates)
			.set({ name: parsed.name, schedule: parsed.schedule })
			.where(eq(thresholdTemplates.id, id));
		return { success: true };
	},

	delete: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing template id' });

		const [existing] = await locals.db
			.select()
			.from(thresholdTemplates)
			.where(eq(thresholdTemplates.id, id))
			.limit(1);
		if (!existing) return fail(404, { error: 'Template not found' });
		if (existing.isBuiltin) return fail(400, { error: 'Builtin templates cannot be deleted' });

		const [config] = await locals.db
			.select()
			.from(globalConfig)
			.where(eq(globalConfig.id, 1))
			.limit(1);
		if (config?.defaultTemplateId === id) {
			return fail(400, {
				error: 'This template is the global default. Pick a different default in Settings first.'
			});
		}

		await locals.db.delete(thresholdTemplates).where(eq(thresholdTemplates.id, id));
		return { success: true };
	}
};
