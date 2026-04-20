export type GraphEnv = {
	GRAPH_TENANT_ID: string;
	GRAPH_CLIENT_ID: string;
	GRAPH_CLIENT_SECRET: string;
};

type TokenResponse = {
	access_token: string;
	expires_in: number;
	token_type: string;
};

export async function getGraphToken(env: GraphEnv): Promise<string> {
	const url = `https://login.microsoftonline.com/${env.GRAPH_TENANT_ID}/oauth2/v2.0/token`;
	const body = new URLSearchParams({
		client_id: env.GRAPH_CLIENT_ID,
		client_secret: env.GRAPH_CLIENT_SECRET,
		scope: 'https://graph.microsoft.com/.default',
		grant_type: 'client_credentials'
	});

	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Graph token request failed (${res.status}): ${text}`);
	}

	const json = (await res.json()) as TokenResponse;
	return json.access_token;
}
