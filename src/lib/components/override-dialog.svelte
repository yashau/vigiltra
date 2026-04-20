<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle,
		DialogTrigger
	} from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import {
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger
	} from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import type { PublicNotificationChannel, ThresholdTemplate } from '$lib/server/db/schema';
	import type { Snippet } from 'svelte';
	import { toast } from 'svelte-sonner';

	type Props = {
		objectId: string;
		appId: string;
		displayName: string;
		templateId: string | null;
		channelOverrideIds: string[] | null;
		templates: ThresholdTemplate[];
		channels: PublicNotificationChannel[];
		trigger: Snippet;
	};

	let {
		objectId,
		appId,
		displayName,
		templateId,
		channelOverrideIds,
		templates,
		channels,
		trigger
	}: Props = $props();

	let open = $state(false);
	let selectedTemplateId = $state('');
	let useCustomChannels = $state(false);
	let selectedChannels = $state<Set<string>>(new Set());

	$effect(() => {
		if (open) return;
		selectedTemplateId = templateId ?? '';
		useCustomChannels = channelOverrideIds !== null;
		selectedChannels = new Set(channelOverrideIds ?? []);
	});

	function toggleChannel(id: string, checked: boolean) {
		const next = new Set(selectedChannels);
		if (checked) next.add(id);
		else next.delete(id);
		selectedChannels = next;
	}

	const templateLabel = $derived.by(() => {
		if (!selectedTemplateId) return 'Use global default';
		return templates.find((t) => t.id === selectedTemplateId)?.name ?? 'Unknown';
	});
</script>

<Dialog bind:open>
	<DialogTrigger>
		{@render trigger()}
	</DialogTrigger>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Override for {displayName}</DialogTitle>
			<DialogDescription>
				Pick a template and channels specific to this app registration. Leave blank to inherit
				the global defaults.
			</DialogDescription>
		</DialogHeader>

		<form
			method="POST"
			action="?/saveOverride"
			use:enhance={() => async ({ result }) => {
				if (result.type === 'success') {
					toast.success('Override saved');
					open = false;
					await invalidateAll();
				} else if (result.type === 'failure') {
					toast.error(String(result.data?.error ?? 'Save failed'));
				}
			}}
			class="flex flex-col gap-5"
		>
			<input type="hidden" name="objectId" value={objectId} />
			<input type="hidden" name="appId" value={appId} />
			<input type="hidden" name="templateId" value={selectedTemplateId} />
			<input type="hidden" name="useCustomChannels" value={useCustomChannels} />

			<div class="flex flex-col gap-2">
				<Label for="override-template">Threshold template</Label>
				<Select type="single" bind:value={selectedTemplateId}>
					<SelectTrigger id="override-template">
						{templateLabel}
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="">Use global default</SelectItem>
						{#each templates as t (t.id)}
							<SelectItem value={t.id}>{t.name}</SelectItem>
						{/each}
					</SelectContent>
				</Select>
			</div>

			<div class="flex flex-col gap-3 rounded-md border p-3">
				<div class="flex items-center justify-between gap-2">
					<div>
						<div class="text-sm font-medium">Custom channels</div>
						<p class="text-muted-foreground text-xs">
							When off, this app uses the global channel list.
						</p>
					</div>
					<Switch bind:checked={useCustomChannels} />
				</div>

				{#if useCustomChannels}
					{#if channels.length === 0}
						<p class="text-muted-foreground text-sm">
							No channels exist yet — create some on the Channels page.
						</p>
					{:else}
						<ul class="flex flex-col gap-2">
							{#each channels as c (c.id)}
								<li class="flex items-center justify-between gap-2">
									<div>
										<div class="text-sm">{c.name}</div>
										<div class="text-muted-foreground text-xs">{c.type}</div>
									</div>
									<Switch
										checked={selectedChannels.has(c.id)}
										onCheckedChange={(v) => toggleChannel(c.id, v)}
									/>
								</li>
							{/each}
						</ul>
						{#each [...selectedChannels] as id (id)}
							<input type="hidden" name="channelIds" value={id} />
						{/each}
					{/if}
				{/if}
			</div>

			<DialogFooter>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit">Save</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
