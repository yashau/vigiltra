// Injects a `scheduled` handler into the adapter-cloudflare worker so that
// Cloudflare cron triggers fire the internal /__cron route.
//
// Cloudflare crons call `scheduled(event, env, ctx)` on the default export.
// adapter-cloudflare only emits `fetch`, so we append a scheduled method that
// dispatches an authenticated request to the SvelteKit /__cron handler
// through the adapter's own fetch entrypoint.

import { readFileSync, writeFileSync } from 'node:fs';

const target = '.svelte-kit/cloudflare/_worker.js';
const src = readFileSync(target, 'utf-8');

const marker = 'var worker_default = {';
const closing = '};\nexport {\n  worker_default as default\n};';

if (!src.includes(marker) || !src.includes(closing)) {
	throw new Error(
		`wrap-worker: could not find adapter-cloudflare worker markers in ${target}. ` +
			'The adapter output shape has changed — update scripts/wrap-worker.mjs.'
	);
}

if (src.includes('// -- vigiltra cron wrap --')) {
	process.stdout.write('wrap-worker: already wrapped, skipping\n');
	process.exit(0);
}

const tsNoCheck = '// @ts-nocheck\n';

const injected = `
};

// -- vigiltra cron wrap --
async function runVigiltraCron(env, ctx) {
  if (!env.CRON_SECRET) throw new Error('CRON_SECRET is not configured');
  const req = new Request('https://cron.vigiltra.internal/__cron', {
    method: 'POST',
    headers: { 'x-cron-secret': env.CRON_SECRET }
  });
  const res = await worker_default.fetch(req, env, ctx);
  if (!res.ok) {
    const body = await res.text();
    throw new Error('cron run failed: ' + res.status + ' ' + body);
  }
}

const vigiltraEntry = {
  fetch: worker_default.fetch,
  async scheduled(event, env, ctx) {
    await runVigiltraCron(env, ctx);
  }
};

export {
  vigiltraEntry as default
};
`;

const wrapped = tsNoCheck + src.replace(closing, injected.trimStart());

writeFileSync(target, wrapped);
process.stdout.write(`wrap-worker: injected scheduled handler into ${target}\n`);
