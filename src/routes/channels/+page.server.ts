import { fail, type Actions } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import {
	appRegOverrides,
	globalConfig,
	notificationChannels,
	toPublicChannel,
	type ChannelConfig,
	type EmailChannelConfig,
	type TelegramChannelConfig
} from '$lib/server/db/schema';
import { sendEmailMessage } from '$lib/server/notifications/email';
import { sendTelegramMessage } from '$lib/server/notifications/telegram';
import type { PageServerLoad } from './$types';

const TELEGRAM_TOKEN_RE = /^\d+:[A-Za-z0-9_-]+$/;

export const load: PageServerLoad = async ({ locals }) => {
	const rows = await locals.db
		.select()
		.from(notificationChannels)
		.orderBy(asc(notificationChannels.name));
	return { channels: rows.map(toPublicChannel) };
};

type ParsedChannel =
	| { name: string; type: 'email'; config: ChannelConfig }
	| { name: string; type: 'telegram'; botTokenProvided: boolean; chat_id: number; bot_token: string };

function parseChannel(form: FormData): ParsedChannel | { error: string } {
	const name = String(form.get('name') ?? '').trim();
	const type = String(form.get('type') ?? '') as 'email' | 'telegram';
	if (!name) return { error: 'Name is required' };
	if (type === 'email') {
		const to = String(form.get('to') ?? '').trim();
		const from = String(form.get('from') ?? '').trim();
		if (!to || !to.includes('@')) return { error: 'Invalid "to" email' };
		if (!from || !from.includes('@')) return { error: 'Invalid "from" email' };
		return { name, type, config: { from, to } };
	}
	if (type === 'telegram') {
		const bot_token = String(form.get('bot_token') ?? '').trim();
		const chat_id = Number(form.get('chat_id'));
		if (!Number.isFinite(chat_id) || !Number.isInteger(chat_id)) {
			return { error: 'chat_id must be an integer' };
		}
		if (bot_token && !TELEGRAM_TOKEN_RE.test(bot_token)) {
			return { error: 'Bot token must match <digits>:<token>' };
		}
		return { name, type, botTokenProvided: bot_token !== '', bot_token, chat_id };
	}
	return { error: 'Unknown channel type' };
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const parsed = parseChannel(form);
		if ('error' in parsed) return fail(400, { error: parsed.error });
		if (parsed.type === 'telegram' && !parsed.botTokenProvided) {
			return fail(400, { error: 'Bot token is required' });
		}
		const id = crypto.randomUUID();
		const config: ChannelConfig =
			parsed.type === 'email'
				? parsed.config
				: { bot_token: parsed.bot_token, chat_id: parsed.chat_id };
		await locals.db
			.insert(notificationChannels)
			.values({ id, name: parsed.name, type: parsed.type, config });
		return { success: true };
	},

	update: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const parsed = parseChannel(form);
		if (!id) return fail(400, { error: 'Missing channel id' });
		if ('error' in parsed) return fail(400, { error: parsed.error });

		let config: ChannelConfig;
		if (parsed.type === 'email') {
			config = parsed.config;
		} else {
			if (parsed.botTokenProvided) {
				config = { bot_token: parsed.bot_token, chat_id: parsed.chat_id };
			} else {
				const [existing] = await locals.db
					.select()
					.from(notificationChannels)
					.where(eq(notificationChannels.id, id))
					.limit(1);
				if (!existing) return fail(404, { error: 'Channel not found' });
				const existingToken =
					existing.type === 'telegram' ? (existing.config as TelegramChannelConfig).bot_token : '';
				if (!existingToken) return fail(400, { error: 'Bot token is required' });
				config = { bot_token: existingToken, chat_id: parsed.chat_id };
			}
		}

		await locals.db
			.update(notificationChannels)
			.set({ name: parsed.name, type: parsed.type, config })
			.where(eq(notificationChannels.id, id));
		return { success: true };
	},

	test: async ({ request, locals, platform }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing channel id' });

		const [channel] = await locals.db
			.select()
			.from(notificationChannels)
			.where(eq(notificationChannels.id, id))
			.limit(1);
		if (!channel) return fail(404, { error: 'Channel not found' });

		const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
		try {
			if (channel.type === 'email') {
				const text = `This is a Vigiltra test message sent at ${timestamp}.\n\nIf you received this, the channel is wired up correctly.`;
				const html = `<p>This is a <strong>Vigiltra</strong> test message sent at <code>${timestamp}</code>.</p><p>If you received this, the channel is wired up correctly.</p>`;
				await sendEmailMessage(
					{ SEND_EMAIL: platform?.env.SEND_EMAIL },
					channel.config as EmailChannelConfig,
					'[Vigiltra] Test message',
					text,
					html
				);
			} else if (channel.type === 'telegram') {
				const text = `<b>Vigiltra</b> — test message (${timestamp}).\n\nIf you received this, the channel is wired up correctly.`;
				await sendTelegramMessage(channel.config as TelegramChannelConfig, text);
			} else {
				return fail(400, { error: `Unknown channel type: ${channel.type}` });
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return fail(502, { error: message.length > 300 ? `${message.slice(0, 300)}…` : message });
		}

		return { success: true };
	},

	delete: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing channel id' });

		await locals.db.delete(notificationChannels).where(eq(notificationChannels.id, id));

		const [config] = await locals.db
			.select()
			.from(globalConfig)
			.where(eq(globalConfig.id, 1))
			.limit(1);
		if (config && config.globalChannelIds.includes(id)) {
			await locals.db
				.update(globalConfig)
				.set({ globalChannelIds: config.globalChannelIds.filter((c) => c !== id) })
				.where(eq(globalConfig.id, 1));
		}

		const overrides = await locals.db.select().from(appRegOverrides);
		for (const ov of overrides) {
			if (ov.channelOverrideIds?.includes(id)) {
				await locals.db
					.update(appRegOverrides)
					.set({ channelOverrideIds: ov.channelOverrideIds.filter((c) => c !== id) })
					.where(eq(appRegOverrides.appObjectId, ov.appObjectId));
			}
		}

		return { success: true };
	}
};
