<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import {
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger
	} from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import { CircleCheck, CircleX } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let defaultTemplateId = $state('');
	let enabledChannels = $state<Set<string>>(new Set());

	$effect(() => {
		defaultTemplateId = data.defaultTemplateId ?? '';
		enabledChannels = new Set(data.globalChannelIds);
	});

	function toggleChannel(id: string, checked: boolean) {
		const next = new Set(enabledChannels);
		if (checked) next.add(id);
		else next.delete(id);
		enabledChannels = next;
	}

	const selectedTemplateName = $derived(
		data.templates.find((t) => t.id === defaultTemplateId)?.name ?? 'Select a template'
	);

	const diagRows: Array<{ label: string; ok: boolean; hint: string }> = $derived([
		{
			label: 'Microsoft Graph credentials',
			ok: data.diagnostics.graph,
			hint: 'GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET'
		},
		{
			label: 'Cloudflare Access',
			ok: data.diagnostics.access,
			hint: 'ACCESS_AUD / ACCESS_TEAM_DOMAIN'
		},
		{
			label: 'Cron secret',
			ok: data.diagnostics.cron,
			hint: 'CRON_SECRET'
		},
		{
			label: 'Email sending',
			ok: data.diagnostics.email,
			hint: 'SEND_EMAIL binding (per-channel from address)'
		}
	]);
</script>

<div class="flex flex-col gap-6">
	<header>
		<h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
		<p class="text-muted-foreground text-sm">
			Defaults applied to every app registration unless overridden.
		</p>
	</header>

	<Card>
		<CardHeader>
			<CardTitle>Digest defaults</CardTitle>
			<CardDescription>
				Template and channels used when an app registration has no override.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<form
				method="POST"
				action="?/updateDefaults"
				use:enhance={() => async ({ result }) => {
					if (result.type === 'success') {
						toast.success('Defaults saved');
						await invalidateAll();
					} else if (result.type === 'failure') {
						toast.error(String(result.data?.error ?? 'Save failed'));
					}
				}}
				class="flex flex-col gap-6"
			>
				<div class="flex flex-col gap-2">
					<Label for="default-template">Default threshold template</Label>
					<Select type="single" bind:value={defaultTemplateId}>
						<SelectTrigger id="default-template" class="max-w-sm">
							{selectedTemplateName}
						</SelectTrigger>
						<SelectContent>
							{#each data.templates as t (t.id)}
								<SelectItem value={t.id}>{t.name}</SelectItem>
							{/each}
						</SelectContent>
					</Select>
					<input type="hidden" name="defaultTemplateId" value={defaultTemplateId} />
				</div>

				<div class="flex flex-col gap-2">
					<Label>Global notification channels</Label>
					<p class="text-muted-foreground text-xs">
						Every monitored app registration uses these channels unless it has its own override.
					</p>
					{#if data.channels.length === 0}
						<p class="text-muted-foreground text-sm">
							No channels yet — create some on the <a href="/channels" class="underline">Channels</a>
							page.
						</p>
					{:else}
						<ul class="flex flex-col gap-2 rounded-md border p-3">
							{#each data.channels as channel (channel.id)}
								<li class="flex items-center justify-between gap-2">
									<div>
										<div class="text-sm font-medium">{channel.name}</div>
										<div class="text-muted-foreground text-xs">{channel.type}</div>
									</div>
									<Switch
										checked={enabledChannels.has(channel.id)}
										onCheckedChange={(v) => toggleChannel(channel.id, v)}
									/>
								</li>
							{/each}
						</ul>
					{/if}
					{#each [...enabledChannels] as id (id)}
						<input type="hidden" name="globalChannelIds" value={id} />
					{/each}
				</div>

				<div>
					<Button type="submit">Save defaults</Button>
				</div>
			</form>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Environment</CardTitle>
			<CardDescription>
				Read-only status of the Worker bindings and secrets Vigiltra depends on.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<ul class="flex flex-col gap-2">
				{#each diagRows as row (row.label)}
					<li class="flex items-center justify-between gap-2 text-sm">
						<div>
							<div class="font-medium">{row.label}</div>
							<div class="text-muted-foreground text-xs">{row.hint}</div>
						</div>
						{#if row.ok}
							<Badge variant="secondary" class="gap-1">
								<CircleCheck class="size-3" /> present
							</Badge>
						{:else}
							<Badge variant="destructive" class="gap-1">
								<CircleX class="size-3" /> missing
							</Badge>
						{/if}
					</li>
				{/each}
			</ul>
		</CardContent>
	</Card>
</div>
