import type { Db } from './db';
import {
	globalConfig,
	refreshStatus,
	thresholdTemplates,
	type ThresholdSchedule
} from './db/schema';

const BUILTIN_TEMPLATES: Array<{ id: string; name: string; schedule: ThresholdSchedule }> = [
	{
		id: '00000000-0000-0000-0000-000000000001',
		name: 'Default',
		schedule: { fires: [30, 14, 7, 6, 5, 4, 3, 2, 1, 0], notify_past_expiry: true }
	},
	{
		id: '00000000-0000-0000-0000-000000000002',
		name: 'Aggressive',
		schedule: { fires: [60, 30, 14, 7, 6, 5, 4, 3, 2, 1, 0], notify_past_expiry: true }
	},
	{
		id: '00000000-0000-0000-0000-000000000003',
		name: 'Minimal',
		schedule: { fires: [7, 3, 2, 1, 0], notify_past_expiry: true }
	}
];

const bootstrapPromises = new WeakMap<Db, Promise<void>>();

export function ensureBootstrap(db: Db): Promise<void> {
	let p = bootstrapPromises.get(db);
	if (!p) {
		p = runBootstrap(db).catch((err) => {
			bootstrapPromises.delete(db);
			throw err;
		});
		bootstrapPromises.set(db, p);
	}
	return p;
}

async function runBootstrap(db: Db): Promise<void> {
	const templateInserts = BUILTIN_TEMPLATES.map((t) =>
		db
			.insert(thresholdTemplates)
			.values({ id: t.id, name: t.name, schedule: t.schedule, isBuiltin: true })
			.onConflictDoNothing()
	);

	const globalConfigInsert = db
		.insert(globalConfig)
		.values({ id: 1, defaultTemplateId: BUILTIN_TEMPLATES[0].id })
		.onConflictDoNothing();

	const refreshStatusInsert = db.insert(refreshStatus).values({ id: 1 }).onConflictDoNothing();

	await db.batch([
		templateInserts[0],
		templateInserts[1],
		templateInserts[2],
		globalConfigInsert,
		refreshStatusInsert
	]);
}
