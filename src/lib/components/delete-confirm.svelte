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
	import type { Snippet } from 'svelte';
	import { toast } from 'svelte-sonner';

	type Props = {
		action: string;
		title: string;
		description: string;
		successMessage: string;
		trigger: Snippet;
		hiddenFields?: Record<string, string>;
	};

	let { action, title, description, successMessage, trigger, hiddenFields = {} }: Props = $props();

	let open = $state(false);
</script>

<Dialog bind:open>
	<DialogTrigger>
		{@render trigger()}
	</DialogTrigger>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>{title}</DialogTitle>
			<DialogDescription>{description}</DialogDescription>
		</DialogHeader>
		<form
			method="POST"
			{action}
			use:enhance={() => async ({ result }) => {
				if (result.type === 'success') {
					toast.success(successMessage);
					open = false;
					await invalidateAll();
				} else if (result.type === 'failure') {
					toast.error(String(result.data?.error ?? 'Delete failed'));
				} else {
					toast.error('Delete failed');
				}
			}}
		>
			{#each Object.entries(hiddenFields) as [k, v] (k)}
				<input type="hidden" name={k} value={v} />
			{/each}
			<DialogFooter>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" variant="destructive">Delete</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
