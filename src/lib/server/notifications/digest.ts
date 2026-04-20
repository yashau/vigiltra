import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import {
	appRegistrations,
	appRegOverrides,
	credentials,
	globalConfig,
	notificationChannels,
	notificationRuns,
	thresholdTemplates,
	type Credential,
	type EmailChannelConfig,
	type NotificationChannel,
	type TelegramChannelConfig,
	type ThresholdSchedule
} from '../db/schema';
import { sendEmailMessage, type EmailEnv } from './email';
import { daysUntilExpiry, shouldFireToday } from './schedule';
import { sendTelegramMessage } from './telegram';

export type DigestEnv = EmailEnv;

type FiringCredential = {
	appDisplayName: string;
	appId: string;
	credential: Credential;
	daysUntil: number;
};

type AppContext = {
	displayName: string;
	appId: string;
	objectId: string;
	monitoringEnabled: boolean;
	template: ThresholdSchedule;
	channelIds: string[];
};

export function runDateUtc(now: Date = new Date()): string {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
		.toISOString()
		.slice(0, 10);
}

export async function runDigest(
	db: Db,
	env: DigestEnv,
	now: Date = new Date()
): Promise<{ firedCredentials: number; channelsHit: number; errors: string[]; skipped: boolean }> {
	const runDate = runDateUtc(now);

	const [existing] = await db
		.select()
		.from(notificationRuns)
		.where(eq(notificationRuns.runDate, runDate))
		.limit(1);

	if (existing?.status === 'completed') {
		return { firedCredentials: 0, channelsHit: 0, errors: [], skipped: true };
	}

	await db
		.insert(notificationRuns)
		.values({ runDate, status: 'pending', startedAt: now })
		.onConflictDoUpdate({
			target: notificationRuns.runDate,
			set: { status: 'pending', startedAt: now, summary: null, completedAt: null }
		});

	const errors: string[] = [];

	try {
		const [config] = await db.select().from(globalConfig).where(eq(globalConfig.id, 1)).limit(1);
		if (!config?.defaultTemplateId) {
			throw new Error('No default threshold template configured');
		}

		const allTemplates = await db.select().from(thresholdTemplates);
		const templateById = new Map(allTemplates.map((t) => [t.id, t.schedule]));
		const defaultTemplate = templateById.get(config.defaultTemplateId);
		if (!defaultTemplate) throw new Error('Default threshold template missing');

		const apps = await db.select().from(appRegistrations);
		const overrides = await db.select().from(appRegOverrides);
		const overrideByApp = new Map(overrides.map((o) => [o.appObjectId, o]));

		const appCtx: AppContext[] = apps.map((a) => {
			const ov = overrideByApp.get(a.objectId);
			const template = (ov?.templateId && templateById.get(ov.templateId)) || defaultTemplate;
			const channelIds = ov?.channelOverrideIds ?? config.globalChannelIds;
			return {
				displayName: a.displayName,
				appId: a.appId,
				objectId: a.objectId,
				monitoringEnabled: ov?.monitoringEnabled ?? true,
				template,
				channelIds
			};
		});

		const monitoredIds = appCtx.filter((c) => c.monitoringEnabled).map((c) => c.objectId);
		const allCreds =
			monitoredIds.length === 0
				? []
				: await db
						.select()
						.from(credentials)
						.where(inArray(credentials.appObjectId, monitoredIds));

		const credsByApp = new Map<string, Credential[]>();
		for (const c of allCreds) {
			const arr = credsByApp.get(c.appObjectId) ?? [];
			arr.push(c);
			credsByApp.set(c.appObjectId, arr);
		}

		const byChannel = new Map<string, FiringCredential[]>();
		let totalFired = 0;

		for (const ctx of appCtx) {
			if (!ctx.monitoringEnabled) continue;
			if (ctx.channelIds.length === 0) continue;
			const creds = credsByApp.get(ctx.objectId) ?? [];
			for (const cred of creds) {
				if (cred.superseded) continue;
				if (!shouldFireToday(cred.endDateTime, ctx.template, now)) continue;
				totalFired++;
				const firing: FiringCredential = {
					appDisplayName: ctx.displayName,
					appId: ctx.appId,
					credential: cred,
					daysUntil: cred.endDateTime ? daysUntilExpiry(cred.endDateTime, now) : 0
				};
				for (const channelId of ctx.channelIds) {
					const arr = byChannel.get(channelId) ?? [];
					arr.push(firing);
					byChannel.set(channelId, arr);
				}
			}
		}

		const channelIds = [...byChannel.keys()];
		const channelRows: NotificationChannel[] =
			channelIds.length === 0
				? []
				: await db
						.select()
						.from(notificationChannels)
						.where(inArray(notificationChannels.id, channelIds));
		const channelById = new Map(channelRows.map((c) => [c.id, c]));

		let channelsHit = 0;
		for (const [channelId, items] of byChannel) {
			const channel = channelById.get(channelId);
			if (!channel) {
				errors.push(`Channel ${channelId} not found`);
				continue;
			}
			try {
				await dispatchToChannel(env, channel, items, runDate);
				channelsHit++;
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				errors.push(`${channel.type}:${channel.name}: ${message}`);
			}
		}

		await db
			.update(notificationRuns)
			.set({
				status: errors.length > 0 ? 'failed' : 'completed',
				completedAt: new Date(),
				summary: { credentials_fired: totalFired, channels_hit: channelsHit, errors }
			})
			.where(eq(notificationRuns.runDate, runDate));

		return { firedCredentials: totalFired, channelsHit, errors, skipped: false };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await db
			.update(notificationRuns)
			.set({
				status: 'failed',
				completedAt: new Date(),
				summary: { credentials_fired: 0, channels_hit: 0, errors: [message] }
			})
			.where(eq(notificationRuns.runDate, runDate));
		throw err;
	}
}

async function dispatchToChannel(
	env: DigestEnv,
	channel: NotificationChannel,
	items: FiringCredential[],
	runDate: string
): Promise<void> {
	if (channel.type === 'email') {
		const subject = `[Vigiltra] ${items.length} credential${items.length === 1 ? '' : 's'} — ${runDate}`;
		await sendEmailMessage(
			env,
			channel.config as EmailChannelConfig,
			subject,
			renderText(items),
			renderHtml(items)
		);
	} else if (channel.type === 'telegram') {
		await sendTelegramMessage(channel.config as TelegramChannelConfig, renderTelegram(items));
	} else {
		throw new Error(`Unknown channel type: ${channel.type}`);
	}
}

function formatDays(days: number): string {
	if (days < 0) return `expired ${Math.abs(days)}d ago`;
	if (days === 0) return 'expires today';
	if (days === 1) return 'expires tomorrow';
	return `in ${days}d`;
}

function renderText(items: FiringCredential[]): string {
	const lines = [
		`Vigiltra — ${items.length} credential${items.length === 1 ? '' : 's'} firing today:`,
		''
	];
	for (const it of items) {
		const credLabel = it.credential.displayName ?? it.credential.hint ?? it.credential.keyId;
		lines.push(
			`• ${it.appDisplayName} (${it.appId}) — ${it.credential.kind} "${credLabel}" ${formatDays(
				it.daysUntil
			)}`
		);
	}
	return lines.join('\n');
}

function renderHtml(items: FiringCredential[]): string {
	const rows = items
		.map((it) => {
			const credLabel = it.credential.displayName ?? it.credential.hint ?? it.credential.keyId;
			return `<li><strong>${escapeHtml(it.appDisplayName)}</strong> <code>${escapeHtml(
				it.appId
			)}</code> — ${it.credential.kind} "${escapeHtml(credLabel)}" ${formatDays(it.daysUntil)}</li>`;
		})
		.join('');
	return `<p>Vigiltra — ${items.length} credential${
		items.length === 1 ? '' : 's'
	} firing today:</p><ul>${rows}</ul>`;
}

function renderTelegram(items: FiringCredential[]): string {
	const header = `<b>Vigiltra</b> — ${items.length} credential${items.length === 1 ? '' : 's'} firing today:`;
	const lines = items.map((it) => {
		const credLabel = it.credential.displayName ?? it.credential.hint ?? it.credential.keyId;
		return `• <b>${escapeHtml(it.appDisplayName)}</b> — ${it.credential.kind} "${escapeHtml(
			credLabel
		)}" ${formatDays(it.daysUntil)}`;
	});
	return [header, '', ...lines].join('\n');
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
