<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from 'svelte-sonner';

	let { objectId, appId, enabled }: { objectId: string; appId: string; enabled: boolean } =
		$props();

	let formEl: HTMLFormElement | undefined = $state();
	let optimistic = $state<boolean | null>(null);
	const current = $derived(optimistic ?? enabled);
</script>

<form
	bind:this={formEl}
	method="POST"
	action="?/toggleMonitoring"
	use:enhance={() => async ({ result }) => {
		if (result.type === 'success') {
			toast.success(current ? 'Monitoring enabled' : 'Monitoring disabled');
			await invalidateAll();
		} else {
			toast.error('Failed to update');
		}
		optimistic = null;
	}}
>
	<input type="hidden" name="objectId" value={objectId} />
	<input type="hidden" name="appId" value={appId} />
	<input type="hidden" name="enabled" value={current} />
	<Switch
		checked={current}
		onCheckedChange={(v) => {
			optimistic = v;
			formEl?.requestSubmit();
		}}
	/>
</form>
