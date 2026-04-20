import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export type AccessUser = {
	sub: string;
	email: string;
	name?: string;
};

type AccessJwtPayload = JWTPayload & {
	email?: string;
	name?: string;
	identity_nonce?: string;
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(teamDomain: string) {
	const issuer = normalizeTeamDomain(teamDomain);
	let jwks = jwksCache.get(issuer);
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
		jwksCache.set(issuer, jwks);
	}
	return { issuer, jwks };
}

function normalizeTeamDomain(teamDomain: string): string {
	const host = teamDomain.replace(/^https?:\/\//i, '').replace(/\/$/, '');
	return `https://${host}`;
}

export async function verifyAccessJwt(
	token: string,
	opts: { audience: string; teamDomain: string }
): Promise<AccessUser> {
	const { issuer, jwks } = getJwks(opts.teamDomain);
	const { payload } = await jwtVerify<AccessJwtPayload>(token, jwks, {
		issuer,
		audience: opts.audience
	});

	if (!payload.sub) throw new Error('Access JWT missing sub');
	if (!payload.email) throw new Error('Access JWT missing email');

	return {
		sub: payload.sub,
		email: payload.email,
		name: payload.name
	};
}
