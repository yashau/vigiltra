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
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import type { ThresholdTemplate } from '$lib/server/db/schema';
	import type { Snippet } from 'svelte';
	import { toast } from 'svelte-sonner';

	type Props = {
		template?: ThresholdTemplate;
		trigger: Snippet;
	};

	let { template, trigger }: Props = $props();

	const isEdit = $derived(!!template);

	let open = $state(false);
	let name = $state('');
	let fires = $state('');
	let notifyPastExpiry = $state(true);

	$effect(() => {
		if (open) return;
		name = template?.name ?? '';
		fires = template?.schedule.fires.join(', ') ?? '30, 14, 7, 6, 5, 4, 3, 2, 1, 0';
		notifyPastExpiry = template?.schedule.notify_past_expiry ?? true;
	});
</script>

<Dialog bind:open>
	<DialogTrigger>
		{@render trigger()}
	</DialogTrigger>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>{isEdit ? 'Edit template' : 'New template'}</DialogTitle>
			<DialogDescription>
				A template fires a notification on specific days before expiry. “Fires” is a
				comma-separated list of day counts (e.g. 30 = D-30).
			</DialogDescription>
		</DialogHeader>

		<form
			method="POST"
			action={isEdit ? '?/update' : '?/create'}
			use:enhance={() => async ({ result }) => {
				if (result.type === 'success') {
					toast.success(isEdit ? 'Template updated' : 'Template created');
					open = false;
					await invalidateAll();
				} else if (result.type === 'failure') {
					toast.error(String(result.data?.error ?? 'Save failed'));
				}
			}}
			class="flex flex-col gap-4"
		>
			{#if isEdit}
				<input type="hidden" name="id" value={template?.id} />
			{/if}
			<input type="hidden" name="notify_past_expiry" value={notifyPastExpiry} />

			<div class="flex flex-col gap-2">
				<Label for="template-name">Name</Label>
				<Input id="template-name" name="name" bind:value={name} required />
			</div>

			<div class="flex flex-col gap-2">
				<Label for="template-fires">Fires (days before expiry)</Label>
				<Input
					id="template-fires"
					name="fires"
					bind:value={fires}
					placeholder="30, 14, 7, 6, 5, 4, 3, 2, 1, 0"
					required
				/>
				<p class="text-muted-foreground text-xs">
					0 fires on the day of expiry. Duplicates are deduped; non-negative integers only.
				</p>
			</div>

			<div class="flex items-center justify-between gap-2 rounded-md border p-3">
				<div>
					<Label for="template-past" class="text-sm font-medium">Keep notifying past expiry</Label>
					<p class="text-muted-foreground text-xs">
						Daily digest until the credential is rotated or monitoring is disabled.
					</p>
				</div>
				<Switch id="template-past" bind:checked={notifyPastExpiry} />
			</div>

			<DialogFooter>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit">{isEdit ? 'Save' : 'Create'}</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
