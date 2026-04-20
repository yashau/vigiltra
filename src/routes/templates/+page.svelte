<script lang="ts">
	import DeleteConfirm from '$lib/components/delete-confirm.svelte';
	import TemplateForm from '$lib/components/template-form.svelte';
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
	import { Lock, Pencil, Plus, Star, Trash2 } from '@lucide/svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="flex flex-col gap-6">
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Threshold templates</h1>
			<p class="text-muted-foreground text-sm">
				How often each monitored credential fires the digest as it approaches expiry.
			</p>
		</div>
		<TemplateForm>
			{#snippet trigger()}
				<Button>
					<Plus class="size-4" /> New template
				</Button>
			{/snippet}
		</TemplateForm>
	</header>

	<div class="border-border hidden rounded-md border md:block">
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Name</TableHead>
					<TableHead>Fires</TableHead>
					<TableHead>Past expiry</TableHead>
					<TableHead class="w-32" />
				</TableRow>
			</TableHeader>
			<TableBody>
				{#each data.templates as template (template.id)}
					{@const isDefault = template.id === data.defaultTemplateId}
					<TableRow>
						<TableCell class="font-medium">
							<div class="flex items-center gap-2">
								<span>{template.name}</span>
								{#if template.isBuiltin}
									<Badge variant="secondary" class="gap-1">
										<Lock class="size-3" /> builtin
									</Badge>
								{/if}
								{#if isDefault}
									<Badge class="gap-1">
										<Star class="size-3" /> default
									</Badge>
								{/if}
							</div>
						</TableCell>
						<TableCell class="text-muted-foreground font-mono text-xs">
							{template.schedule.fires.join(', ')}
						</TableCell>
						<TableCell>
							{template.schedule.notify_past_expiry ? 'Yes' : 'No'}
						</TableCell>
						<TableCell class="text-right">
							<div class="flex justify-end gap-1">
								{#if !template.isBuiltin}
									<TemplateForm {template}>
										{#snippet trigger()}
											<Button variant="ghost" size="icon" aria-label="Edit">
												<Pencil class="size-4" />
											</Button>
										{/snippet}
									</TemplateForm>
									<DeleteConfirm
										action="?/delete"
										title="Delete template?"
										description="“{template.name}” will be removed. App-reg overrides that used it will fall back to the global default."
										successMessage="Template deleted"
										hiddenFields={{ id: template.id }}
									>
										{#snippet trigger()}
											<Button variant="ghost" size="icon" aria-label="Delete">
												<Trash2 class="size-4" />
											</Button>
										{/snippet}
									</DeleteConfirm>
								{/if}
							</div>
						</TableCell>
					</TableRow>
				{/each}
			</TableBody>
		</Table>
	</div>

	<div class="flex flex-col gap-3 md:hidden">
		{#each data.templates as template (template.id)}
			{@const isDefault = template.id === data.defaultTemplateId}
			<div class="border-border bg-card flex flex-col gap-3 rounded-md border p-3">
				<div class="flex items-start gap-2">
					<div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
						<span class="font-medium">{template.name}</span>
						{#if template.isBuiltin}
							<Badge variant="secondary" class="gap-1">
								<Lock class="size-3" /> builtin
							</Badge>
						{/if}
						{#if isDefault}
							<Badge class="gap-1">
								<Star class="size-3" /> default
							</Badge>
						{/if}
					</div>
					{#if !template.isBuiltin}
						<div class="flex shrink-0 items-center gap-1">
							<TemplateForm {template}>
								{#snippet trigger()}
									<Button variant="ghost" size="icon" aria-label="Edit">
										<Pencil class="size-4" />
									</Button>
								{/snippet}
							</TemplateForm>
							<DeleteConfirm
								action="?/delete"
								title="Delete template?"
								description="“{template.name}” will be removed. App-reg overrides that used it will fall back to the global default."
								successMessage="Template deleted"
								hiddenFields={{ id: template.id }}
							>
								{#snippet trigger()}
									<Button variant="ghost" size="icon" aria-label="Delete">
										<Trash2 class="size-4" />
									</Button>
								{/snippet}
							</DeleteConfirm>
						</div>
					{/if}
				</div>
				<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
					<dt class="text-muted-foreground">Fires</dt>
					<dd class="font-mono text-xs">{template.schedule.fires.join(', ')}</dd>
					<dt class="text-muted-foreground">Past expiry</dt>
					<dd>{template.schedule.notify_past_expiry ? 'Yes' : 'No'}</dd>
				</dl>
			</div>
		{/each}
	</div>
</div>
