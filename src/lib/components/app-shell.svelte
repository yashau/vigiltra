<script lang="ts">
	import { page } from '$app/state';
	import { ShieldCheck } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import ThemeToggle from './theme-toggle.svelte';

	const nav: { href: string; label: string }[] = [
		{ href: '/', label: 'Apps' },
		{ href: '/channels', label: 'Channels' },
		{ href: '/templates', label: 'Templates' },
		{ href: '/settings', label: 'Settings' }
	];

	let { children }: { children: Snippet } = $props();

	function isActive(href: string) {
		const path = page.url.pathname;
		return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
	}
</script>

<div class="bg-background text-foreground min-h-screen">
	<header class="border-border bg-card sticky top-0 z-10 border-b">
		<div class="mx-auto flex h-14 max-w-7xl items-center gap-3 px-3 sm:gap-6 sm:px-4">
			<a href="/" class="flex shrink-0 items-center gap-2 font-semibold">
				<ShieldCheck class="size-5" />
				<span class="hidden sm:inline">Vigiltra</span>
			</a>
			<nav class="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto text-sm">
				{#each nav as item (item.href)}
					<a
						href={item.href}
						class="hover:bg-accent hover:text-accent-foreground shrink-0 rounded-md px-3 py-1.5 transition-colors"
						class:bg-accent={isActive(item.href)}
						class:text-accent-foreground={isActive(item.href)}
					>
						{item.label}
					</a>
				{/each}
			</nav>
			<div class="ml-auto flex shrink-0 items-center gap-2">
				<ThemeToggle />
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-7xl px-4 py-6">
		{@render children()}
	</main>
</div>
