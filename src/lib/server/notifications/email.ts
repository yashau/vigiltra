import type { EmailChannelConfig } from '../db/schema';

export type EmailEnv = {
	SEND_EMAIL?: SendEmail;
};

export async function sendEmailMessage(
	env: EmailEnv,
	config: EmailChannelConfig,
	subject: string,
	textBody: string,
	htmlBody: string
): Promise<void> {
	if (!env.SEND_EMAIL) {
		throw new Error(
			'SEND_EMAIL binding not configured. Add a Cloudflare Email Sending binding to wrangler.jsonc.'
		);
	}

	await env.SEND_EMAIL.send({
		from: config.from,
		to: config.to,
		subject,
		text: textBody,
		html: htmlBody
	});
}
