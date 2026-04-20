<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { mode, toggleMode } from 'mode-watcher';
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';
</script>

<Button variant="outline" size="icon" onclick={toggleMode} aria-label="Toggle theme">
	{#if mode.current === 'dark'}
		<SunIcon class="size-5" />
	{:else}
		<MoonIcon class="size-5" />
	{/if}
</Button>
