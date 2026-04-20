import { sql } from 'drizzle-orm';
import type { Db } from '../db';
import {
	appRegistrations,
	credentials,
	refreshStatus,
	type NewAppRegistration,
	type NewCredential
} from '../db/schema';
import {
	fetchAllAppRegistrations,
	fetchAllSamlServicePrincipals,
	parseDate,
	type FetchedApp,
	type GraphKeyCredential,
	type GraphPasswordCredential
} from './apps';
import { getGraphToken, type GraphEnv } from './token';

type BatchStmt = Parameters<Db['batch']>[0][number];

export async function refreshGraphCache(db: Db, env: GraphEnv): Promise<void> {
	await db
		.update(refreshStatus)
		.set({
			lastRefreshStartedAt: new Date(),
			lastRefreshStatus: 'pending',
			lastRefreshError: null
		})
		.where(sql`${refreshStatus.id} = 1`);

	let merged: FetchedApp[];
	try {
		const token = await getGraphToken(env);
		const [apps, samlSps] = await Promise.all([
			fetchAllAppRegistrations(token),
			fetchAllSamlServicePrincipals(token)
		]);
		merged = mergeAppsAndServicePrincipals(apps, samlSps);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await db
			.update(refreshStatus)
			.set({
				lastRefreshCompletedAt: new Date(),
				lastRefreshStatus: 'failed',
				lastRefreshError: message
			})
			.where(sql`${refreshStatus.id} = 1`);
		throw err;
	}

	const refreshedAt = new Date();
	const appRows = toAppRows(merged, refreshedAt);
	const credRows = toCredentialRows(merged);

	const APP_CHUNK = 10;
	const CRED_CHUNK = 8;
	const stmts: BatchStmt[] = [db.delete(credentials), db.delete(appRegistrations)];
	for (let i = 0; i < appRows.length; i += APP_CHUNK) {
		stmts.push(db.insert(appRegistrations).values(appRows.slice(i, i + APP_CHUNK)));
	}
	for (let i = 0; i < credRows.length; i += CRED_CHUNK) {
		stmts.push(db.insert(credentials).values(credRows.slice(i, i + CRED_CHUNK)));
	}
	stmts.push(
		db
			.update(refreshStatus)
			.set({
				lastRefreshCompletedAt: new Date(),
				lastRefreshStatus: 'success',
				lastRefreshError: null,
				appRegCount: appRows.length,
				credentialCount: credRows.length
			})
			.where(sql`${refreshStatus.id} = 1`)
	);

	try {
		await db.batch(stmts as [BatchStmt, ...BatchStmt[]]);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await db
			.update(refreshStatus)
			.set({
				lastRefreshCompletedAt: new Date(),
				lastRefreshStatus: 'failed',
				lastRefreshError: message
			})
			.where(sql`${refreshStatus.id} = 1`);
		throw err;
	}
}

function mergeAppsAndServicePrincipals(
	apps: FetchedApp[],
	samlSps: FetchedApp[]
): FetchedApp[] {
	const byAppId = new Map<string, FetchedApp>();
	for (const app of apps) byAppId.set(app.appId, app);

	for (const sp of samlSps) {
		const existing = byAppId.get(sp.appId);
		if (!existing) {
			byAppId.set(sp.appId, sp);
			continue;
		}
		existing.hasSamlSso = true;
		existing.preferredSigningKeyThumbprint =
			sp.preferredSigningKeyThumbprint ?? existing.preferredSigningKeyThumbprint;
		existing.passwordCredentials = mergePasswordCredentials(
			existing.passwordCredentials,
			sp.passwordCredentials
		);
		existing.keyCredentials = mergeKeyCredentials(existing.keyCredentials, sp.keyCredentials);
	}

	return [...byAppId.values()];
}

function mergePasswordCredentials(
	a: GraphPasswordCredential[],
	b: GraphPasswordCredential[]
): GraphPasswordCredential[] {
	const byKey = new Map<string, GraphPasswordCredential>();
	for (const c of [...a, ...b]) byKey.set(c.keyId, c);
	return [...byKey.values()];
}

function mergeKeyCredentials(
	a: GraphKeyCredential[],
	b: GraphKeyCredential[]
): GraphKeyCredential[] {
	const byKey = new Map<string, GraphKeyCredential>();
	for (const c of [...a, ...b]) byKey.set(c.keyId, c);
	return [...byKey.values()];
}

function toAppRows(fetched: FetchedApp[], refreshedAt: Date): NewAppRegistration[] {
	return fetched.map((f) => ({
		objectId: f.objectId,
		appId: f.appId,
		displayName: f.displayName,
		kind: f.kind,
		hasSamlSso: f.hasSamlSso,
		preferredSigningKeyThumbprint: f.preferredSigningKeyThumbprint,
		createdDateTime: f.createdDateTime,
		refreshedAt
	}));
}

function toCredentialRows(fetched: FetchedApp[]): NewCredential[] {
	const rows: NewCredential[] = [];
	for (const f of fetched) {
		const appRows: NewCredential[] = [];
		const seen = new Set<string>();
		for (const pc of f.passwordCredentials) {
			const key = `${f.objectId}:${pc.keyId}`;
			if (seen.has(key)) continue;
			seen.add(key);
			appRows.push({
				appObjectId: f.objectId,
				keyId: pc.keyId,
				kind: 'secret',
				displayName: pc.displayName ?? null,
				startDateTime: parseDate(pc.startDateTime),
				endDateTime: parseDate(pc.endDateTime),
				hint: pc.hint ?? null,
				usage: null,
				keyType: null,
				customKeyIdentifier: null,
				superseded: false
			});
		}
		for (const kc of f.keyCredentials) {
			const key = `${f.objectId}:${kc.keyId}`;
			if (seen.has(key)) continue;
			seen.add(key);
			appRows.push({
				appObjectId: f.objectId,
				keyId: kc.keyId,
				kind: 'certificate',
				displayName: kc.displayName ?? null,
				startDateTime: parseDate(kc.startDateTime),
				endDateTime: parseDate(kc.endDateTime),
				hint: null,
				usage: kc.usage ?? null,
				keyType: kc.type ?? null,
				customKeyIdentifier: kc.customKeyIdentifier ?? null,
				superseded: false
			});
		}
		markSuperseded(appRows);
		rows.push(...appRows);
	}
	return rows;
}

function markSuperseded(rows: NewCredential[]): void {
	const latestEndByKind = new Map<'secret' | 'certificate', number>();
	for (const r of rows) {
		const end = r.endDateTime?.getTime();
		if (end === undefined) continue;
		const prev = latestEndByKind.get(r.kind);
		if (prev === undefined || end > prev) latestEndByKind.set(r.kind, end);
	}
	for (const r of rows) {
		const end = r.endDateTime?.getTime();
		if (end === undefined) continue;
		const latest = latestEndByKind.get(r.kind);
		if (latest !== undefined && end < latest) r.superseded = true;
	}
}
