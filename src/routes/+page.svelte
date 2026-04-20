<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import MonitoringToggle from '$lib/components/monitoring-toggle.svelte';
	import OverrideDialog from '$lib/components/override-dialog.svelte';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import { expiryBucket, formatDate, formatExpiry } from '$lib/expiry';
	import {
		FileBadge,
		KeyRound,
		RefreshCw,
		ShieldCheck,
		SlidersHorizontal,
		Star
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import type { PageData } from './$types';
	import type { AppRow } from './+page.server';

	let { data }: { data: PageData } = $props();

	let search = $state('');
	let filter = $state<'all' | 'expiring' | 'expired' | 'disabled' | 'saml' | 'app_reg'>('all');
	let refreshing = $state(false);

	const filters = [
		{ value: 'all', label: 'All' },
		{ value: 'expiring', label: 'Expiring ≤30d' },
		{ value: 'expired', label: 'Expired' },
		{ value: 'app_reg', label: 'App registrations' },
		{ value: 'saml', label: 'SAML apps' },
		{ value: 'disabled', label: 'Monitoring off' }
	] as const;

	function isPreferredSamlCert(row: AppRow, keyId: string, customKeyId: string | null): boolean {
		if (!row.hasSamlSso) return false;
		if (!row.preferredSigningKeyThumbprint) return false;
		const expected = row.preferredSigningKeyThumbprint.toLowerCase();
		if (keyId.toLowerCase() === expected) return true;
		if (customKeyId) {
			try {
				const bytes = atob(customKeyId);
				let hex = '';
				for (let i = 0; i < bytes.length; i++) {
					hex += bytes.charCodeAt(i).toString(16).padStart(2, '0');
				}
				if (hex === expected) return true;
			} catch {
				// ignore
			}
		}
		return false;
	}

	const filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return data.rows.filter((row) => {
			if (q) {
				const hay = `${row.displayName} ${row.appId}`.toLowerCase();
				if (!hay.includes(q)) return false;
			}
			if (filter === 'disabled') return !row.monitoringEnabled;
			if (filter === 'saml') return row.hasSamlSso;
			if (filter === 'app_reg') return row.kind === 'app_registration';
			if (filter === 'expired') {
				return row.credentials.some(
					(c) => !c.superseded && expiryBucket(c.endDateTime) === 'expired'
				);
			}
			if (filter === 'expiring') {
				return row.credentials.some((c) => {
					if (c.superseded) return false;
					const b = expiryBucket(c.endDateTime);
					return b === 'critical' || b === 'warning';
				});
			}
			return true;
		});
	});

	function expiryBadgeVariant(end: Date | null) {
		const b = expiryBucket(end);
		if (b === 'expired' || b === 'critical') return 'destructive' as const;
		if (b === 'warning') return 'warning' as const;
		return 'secondary' as const;
	}
</script>

<div class="flex flex-col gap-6">
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">App registrations</h1>
			<p class="text-muted-foreground text-sm">
				{#if data.status?.lastRefreshCompletedAt}
					Last refresh {formatDate(data.status.lastRefreshCompletedAt)}
					{#if data.status.lastRefreshStatus === 'failed'}
						<span class="text-destructive">— failed: {data.status.lastRefreshError}</span>
					{/if}
				{:else}
					No refresh yet — click Refresh to populate the cache.
				{/if}
			</p>
		</div>
		<form
			method="POST"
			action="?/refresh"
			use:enhance={() => {
				refreshing = true;
				return async ({ result }) => {
					refreshing = false;
					if (result.type === 'success') {
						toast.success('Cache refreshed');
						await invalidateAll();
					} else if (result.type === 'failure') {
						toast.error(`Refresh failed: ${result.data?.error ?? 'unknown error'}`);
					}
				};
			}}
		>
			<Button type="submit" disabled={refreshing}>
				<RefreshCw class="size-4 {refreshing ? 'animate-spin' : ''}" />
				{refreshing ? 'Refreshing…' : 'Refresh now'}
			</Button>
		</form>
	</header>

	<div class="flex flex-wrap items-center gap-2">
		<Input
			placeholder="Search by name or app ID…"
			bind:value={search}
			class="w-full sm:max-w-xs"
		/>
		<div class="flex flex-wrap gap-1">
			{#each filters as f (f.value)}
				<Button
					variant={filter === f.value ? 'default' : 'outline'}
					size="sm"
					onclick={() => (filter = f.value)}
				>
					{f.label}
				</Button>
			{/each}
		</div>
	</div>

	<div class="border-border hidden rounded-md border md:block">
		<Table class="table-fixed" containerClass="overflow-x-hidden">
			<TableHeader>
				<TableRow>
					<TableHead>Application</TableHead>
					<TableHead>Credentials</TableHead>
					<TableHead class="w-32">Expires</TableHead>
					<TableHead class="w-40" />
				</TableRow>
			</TableHeader>
			<TableBody>
				{#each filtered as row (row.objectId)}
					<TableRow>
						<TableCell class="align-top">
							<div class="flex items-center gap-2">
								<span class="min-w-0 truncate font-medium">{row.displayName}</span>
								{#if row.hasSamlSso}
									<Badge variant="secondary" class="shrink-0 gap-1">
										<ShieldCheck class="size-3" />
										SAML
									</Badge>
								{/if}
							</div>
							<div class="text-muted-foreground truncate font-mono text-xs">{row.appId}</div>
						</TableCell>
						<TableCell class="align-top">
							{#if row.credentials.length === 0}
								<span class="text-muted-foreground text-sm">None</span>
							{:else}
								<ul class="flex flex-col gap-1.5">
									{#each row.credentials as cred (cred.keyId)}
										{@const preferred = isPreferredSamlCert(
											row,
											cred.keyId,
											cred.customKeyIdentifier
										)}
										<li
											class="flex items-center gap-2 text-sm {cred.superseded
												? 'text-muted-foreground line-through opacity-60'
												: ''}"
										>
											{#if cred.kind === 'secret'}
												<KeyRound class="text-muted-foreground size-3.5 shrink-0" />
											{:else}
												<FileBadge class="text-muted-foreground size-3.5 shrink-0" />
											{/if}
											<span class="min-w-0 truncate">
												{cred.displayName ?? cred.hint ?? cred.keyId.slice(0, 8)}
											</span>
											{#if preferred}
												<Star
													class="size-3 shrink-0 text-amber-500"
													aria-label="Preferred signing cert"
												/>
											{/if}
											{#if cred.superseded}
												<Badge variant="outline">Superseded</Badge>
											{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</TableCell>
						<TableCell class="align-top">
							{#if row.soonestExpiry}
								<Badge variant={expiryBadgeVariant(row.soonestExpiry)}>
									{formatExpiry(row.soonestExpiry)}
								</Badge>
							{:else}
								<span class="text-muted-foreground text-sm">—</span>
							{/if}
						</TableCell>
						<TableCell class="text-right align-top">
							<div class="flex items-center justify-end gap-1">
								<OverrideDialog
									objectId={row.objectId}
									appId={row.appId}
									displayName={row.displayName}
									templateId={row.templateId}
									channelOverrideIds={row.channelOverrideIds}
									templates={data.templates}
									channels={data.channels}
								>
									{#snippet trigger()}
										<Button variant="ghost" size="icon" aria-label="Override">
											<SlidersHorizontal class="size-4" />
										</Button>
									{/snippet}
								</OverrideDialog>
								<MonitoringToggle
									objectId={row.objectId}
									appId={row.appId}
									enabled={row.monitoringEnabled}
								/>
							</div>
						</TableCell>
					</TableRow>
				{/each}
				{#if filtered.length === 0}
					<TableRow>
						<TableCell colspan={4} class="text-muted-foreground py-8 text-center">
							No app registrations match.
						</TableCell>
					</TableRow>
				{/if}
			</TableBody>
		</Table>
	</div>

	<div class="flex flex-col gap-3 md:hidden">
		{#each filtered as row (row.objectId)}
			<div class="border-border bg-card flex flex-col gap-3 rounded-md border p-3">
				<div class="flex items-start gap-2">
					<div class="flex min-w-0 flex-1 flex-col gap-1">
						<div class="flex flex-wrap items-center gap-2">
							<span class="min-w-0 truncate font-medium">{row.displayName}</span>
							{#if row.hasSamlSso}
								<Badge variant="secondary" class="shrink-0 gap-1">
									<ShieldCheck class="size-3" />
									SAML
								</Badge>
							{/if}
						</div>
						<div class="text-muted-foreground truncate font-mono text-xs">{row.appId}</div>
						{#if row.soonestExpiry}
							<div>
								<Badge variant={expiryBadgeVariant(row.soonestExpiry)}>
									{formatExpiry(row.soonestExpiry)}
								</Badge>
							</div>
						{/if}
					</div>
					<div class="flex shrink-0 items-center gap-1">
						<OverrideDialog
							objectId={row.objectId}
							appId={row.appId}
							displayName={row.displayName}
							templateId={row.templateId}
							channelOverrideIds={row.channelOverrideIds}
							templates={data.templates}
							channels={data.channels}
						>
							{#snippet trigger()}
								<Button variant="ghost" size="icon" aria-label="Override">
									<SlidersHorizontal class="size-4" />
								</Button>
							{/snippet}
						</OverrideDialog>
						<MonitoringToggle
							objectId={row.objectId}
							appId={row.appId}
							enabled={row.monitoringEnabled}
						/>
					</div>
				</div>
				{#if row.credentials.length === 0}
					<span class="text-muted-foreground text-sm">No credentials</span>
				{:else}
					<ul class="flex flex-col gap-1.5">
						{#each row.credentials as cred (cred.keyId)}
							{@const preferred = isPreferredSamlCert(row, cred.keyId, cred.customKeyIdentifier)}
							<li
								class="flex items-center gap-2 text-sm {cred.superseded
									? 'text-muted-foreground line-through opacity-60'
									: ''}"
							>
								{#if cred.kind === 'secret'}
									<KeyRound class="text-muted-foreground size-3.5 shrink-0" />
								{:else}
									<FileBadge class="text-muted-foreground size-3.5 shrink-0" />
								{/if}
								<span class="min-w-0 truncate">
									{cred.displayName ?? cred.hint ?? cred.keyId.slice(0, 8)}
								</span>
								{#if preferred}
									<Star
										class="size-3 shrink-0 text-amber-500"
										aria-label="Preferred signing cert"
									/>
								{/if}
								{#if cred.superseded}
									<Badge variant="outline">Superseded</Badge>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/each}
		{#if filtered.length === 0}
			<div
				class="border-border text-muted-foreground rounded-md border py-8 text-center text-sm"
			>
				No app registrations match.
			</div>
		{/if}
	</div>
</div>
