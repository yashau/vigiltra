<script lang="ts">
	import { enhance } from '$app/forms';
	import ChannelForm from '$lib/components/channel-form.svelte';
	import DeleteConfirm from '$lib/components/delete-confirm.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import type { PublicNotificationChannel } from '$lib/server/db/schema';
	import { Pencil, Plus, Send, Trash2 } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let testing = $state<Set<string>>(new Set());

	function setTesting(id: string, value: boolean) {
		const next = new Set(testing);
		if (value) next.add(id);
		else next.delete(id);
		testing = next;
	}

	function describe(channel: PublicNotificationChannel): string {
		if (channel.type === 'email') return (channel.config as { to: string }).to;
		if (channel.type === 'telegram')
			return `chat ${(channel.config as { chat_id: number }).chat_id}`;
		return '';
	}
</script>

<div class="flex flex-col gap-6">
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Notification channels</h1>
			<p class="text-muted-foreground text-sm">
				Destinations that receive the daily digest. Assign them globally in Settings or per app registration.
			</p>
		</div>
		<ChannelForm>
			{#snippet trigger()}
				<Button>
					<Plus class="size-4" /> New channel
				</Button>
			{/snippet}
		</ChannelForm>
	</header>

	<div class="border-border hidden rounded-md border md:block">
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Name</TableHead>
					<TableHead>Type</TableHead>
					<TableHead>Destination</TableHead>
					<TableHead class="w-40" />
				</TableRow>
			</TableHeader>
			<TableBody>
				{#each data.channels as channel (channel.id)}
					<TableRow>
						<TableCell class="font-medium">{channel.name}</TableCell>
						<TableCell>
							<Badge variant="secondary">{channel.type}</Badge>
						</TableCell>
						<TableCell class="text-muted-foreground font-mono text-xs">
							{describe(channel)}
						</TableCell>
						<TableCell class="text-right">
							<div class="flex justify-end gap-1">
								<form
									method="POST"
									action="?/test"
									use:enhance={() => {
										setTesting(channel.id, true);
										return async ({ result }) => {
											setTesting(channel.id, false);
											if (result.type === 'success') {
												toast.success('Test message sent');
											} else if (result.type === 'failure') {
												toast.error(String(result.data?.error ?? 'Test failed'));
											}
										};
									}}
								>
									<input type="hidden" name="id" value={channel.id} />
									<Button
										type="submit"
										variant="ghost"
										size="icon"
										aria-label="Send test"
										disabled={testing.has(channel.id)}
									>
										<Send class="size-4 {testing.has(channel.id) ? 'animate-pulse' : ''}" />
									</Button>
								</form>
								<ChannelForm {channel}>
									{#snippet trigger()}
										<Button variant="ghost" size="icon" aria-label="Edit">
											<Pencil class="size-4" />
										</Button>
									{/snippet}
								</ChannelForm>
								<DeleteConfirm
									action="?/delete"
									title="Delete channel?"
									description="“{channel.name}” will be removed from any app registration overrides and the global default."
									successMessage="Channel deleted"
									hiddenFields={{ id: channel.id }}
								>
									{#snippet trigger()}
										<Button variant="ghost" size="icon" aria-label="Delete">
											<Trash2 class="size-4" />
										</Button>
									{/snippet}
								</DeleteConfirm>
							</div>
						</TableCell>
					</TableRow>
				{/each}
				{#if data.channels.length === 0}
					<TableRow>
						<TableCell colspan={4} class="text-muted-foreground py-8 text-center">
							No channels yet. Click “New channel” to add one.
						</TableCell>
					</TableRow>
				{/if}
			</TableBody>
		</Table>
	</div>

	<div class="flex flex-col gap-3 md:hidden">
		{#each data.channels as channel (channel.id)}
			<div class="border-border bg-card flex flex-col gap-2 rounded-md border p-3">
				<div class="flex items-start gap-2">
					<div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
						<span class="font-medium">{channel.name}</span>
						<Badge variant="secondary">{channel.type}</Badge>
					</div>
					<div class="flex shrink-0 items-center gap-1">
						<form
							method="POST"
							action="?/test"
							use:enhance={() => {
								setTesting(channel.id, true);
								return async ({ result }) => {
									setTesting(channel.id, false);
									if (result.type === 'success') {
										toast.success('Test message sent');
									} else if (result.type === 'failure') {
										toast.error(String(result.data?.error ?? 'Test failed'));
									}
								};
							}}
						>
							<input type="hidden" name="id" value={channel.id} />
							<Button
								type="submit"
								variant="ghost"
								size="icon"
								aria-label="Send test"
								disabled={testing.has(channel.id)}
							>
								<Send class="size-4 {testing.has(channel.id) ? 'animate-pulse' : ''}" />
							</Button>
						</form>
						<ChannelForm {channel}>
							{#snippet trigger()}
								<Button variant="ghost" size="icon" aria-label="Edit">
									<Pencil class="size-4" />
								</Button>
							{/snippet}
						</ChannelForm>
						<DeleteConfirm
							action="?/delete"
							title="Delete channel?"
							description="“{channel.name}” will be removed from any app registration overrides and the global default."
							successMessage="Channel deleted"
							hiddenFields={{ id: channel.id }}
						>
							{#snippet trigger()}
								<Button variant="ghost" size="icon" aria-label="Delete">
									<Trash2 class="size-4" />
								</Button>
							{/snippet}
						</DeleteConfirm>
					</div>
				</div>
				<div class="text-muted-foreground truncate font-mono text-xs">
					{describe(channel)}
				</div>
			</div>
		{/each}
		{#if data.channels.length === 0}
			<div
				class="border-border text-muted-foreground rounded-md border py-8 text-center text-sm"
			>
				No channels yet. Click “New channel” to add one.
			</div>
		{/if}
	</div>
</div>
