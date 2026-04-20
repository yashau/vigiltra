import type { TelegramChannelConfig } from '../db/schema';

export async function sendTelegramMessage(
	config: TelegramChannelConfig,
	text: string
): Promise<void> {
	const url = `https://api.telegram.org/bot${config.bot_token}/sendMessage`;
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			chat_id: config.chat_id,
			text,
			parse_mode: 'HTML',
			disable_web_page_preview: true
		})
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Telegram sendMessage failed (${res.status}): ${body}`);
	}
}
