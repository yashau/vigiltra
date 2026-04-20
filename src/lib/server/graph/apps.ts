const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export type GraphPasswordCredential = {
	keyId: string;
	displayName?: string | null;
	startDateTime?: string | null;
	endDateTime?: string | null;
	hint?: string | null;
};

export type GraphKeyCredential = {
	keyId: string;
	displayName?: string | null;
	startDateTime?: string | null;
	endDateTime?: string | null;
	usage?: string | null;
	type?: string | null;
	customKeyIdentifier?: string | null;
};

type GraphApplication = {
	id: string;
	appId: string;
	displayName: string;
	createdDateTime?: string | null;
	passwordCredentials?: GraphPasswordCredential[];
	keyCredentials?: GraphKeyCredential[];
};

type GraphServicePrincipal = {
	id: string;
	appId: string;
	displayName: string;
	preferredSingleSignOnMode?: string | null;
	preferredTokenSigningKeyThumbprint?: string | null;
	passwordCredentials?: GraphPasswordCredential[];
	keyCredentials?: GraphKeyCredential[];
};

type GraphListResponse<T> = {
	value: T[];
	'@odata.nextLink'?: string;
};

export type FetchedApp = {
	objectId: string;
	appId: string;
	displayName: string;
	kind: 'app_registration' | 'enterprise_app';
	hasSamlSso: boolean;
	createdDateTime: Date | null;
	preferredSigningKeyThumbprint: string | null;
	passwordCredentials: GraphPasswordCredential[];
	keyCredentials: GraphKeyCredential[];
};

export async function fetchAllAppRegistrations(token: string): Promise<FetchedApp[]> {
	const select = [
		'id',
		'appId',
		'displayName',
		'createdDateTime',
		'passwordCredentials',
		'keyCredentials'
	].join(',');
	let url: string | undefined = `${GRAPH_BASE}/applications?$select=${select}&$top=999`;

	const out: FetchedApp[] = [];
	while (url) {
		const res: Response = await fetch(url, {
			headers: { Authorization: `Bearer ${token}` }
		});
		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Graph /applications failed (${res.status}): ${text}`);
		}
		const json: GraphListResponse<GraphApplication> = await res.json();
		for (const app of json.value) out.push(toFetchedApplication(app));
		url = json['@odata.nextLink'];
	}
	return out;
}

export async function fetchAllSamlServicePrincipals(token: string): Promise<FetchedApp[]> {
	const select = [
		'id',
		'appId',
		'displayName',
		'preferredSingleSignOnMode',
		'preferredTokenSigningKeyThumbprint',
		'passwordCredentials',
		'keyCredentials'
	].join(',');
	const filter = `preferredSingleSignOnMode eq 'saml'`;
	let url: string | undefined =
		`${GRAPH_BASE}/servicePrincipals?$select=${select}&$filter=${encodeURIComponent(filter)}&$top=999`;

	const out: FetchedApp[] = [];
	while (url) {
		const res: Response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${token}`,
				ConsistencyLevel: 'eventual'
			}
		});
		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Graph /servicePrincipals failed (${res.status}): ${text}`);
		}
		const json: GraphListResponse<GraphServicePrincipal> = await res.json();
		for (const sp of json.value) out.push(toFetchedServicePrincipal(sp));
		url = json['@odata.nextLink'];
	}
	return out;
}

function toFetchedApplication(app: GraphApplication): FetchedApp {
	return {
		objectId: app.id,
		appId: app.appId,
		displayName: app.displayName,
		kind: 'app_registration',
		hasSamlSso: false,
		createdDateTime: parseDate(app.createdDateTime),
		preferredSigningKeyThumbprint: null,
		passwordCredentials: app.passwordCredentials ?? [],
		keyCredentials: app.keyCredentials ?? []
	};
}

function toFetchedServicePrincipal(sp: GraphServicePrincipal): FetchedApp {
	return {
		objectId: sp.id,
		appId: sp.appId,
		displayName: sp.displayName,
		kind: 'enterprise_app',
		hasSamlSso: true,
		createdDateTime: null,
		preferredSigningKeyThumbprint: sp.preferredTokenSigningKeyThumbprint ?? null,
		passwordCredentials: sp.passwordCredentials ?? [],
		keyCredentials: sp.keyCredentials ?? []
	};
}

export function parseDate(value: string | null | undefined): Date | null {
	if (!value) return null;
	const t = Date.parse(value);
	return Number.isFinite(t) ? new Date(t) : null;
}
