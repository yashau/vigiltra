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
	import {
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger
	} from '$lib/components/ui/select';
	import type {
		PublicEmailChannelConfig,
		PublicNotificationChannel,
		PublicTelegramChannelConfig
	} from '$lib/server/db/schema';
	import type { Snippet } from 'svelte';
	import { toast } from 'svelte-sonner';

	type Props = {
		channel?: PublicNotificationChannel;
		trigger: Snippet;
	};
	let { channel, trigger }: Props = $props();

	const isEdit = $derived(!!channel);

	let open = $state(false);
	let type = $state<'email' | 'telegram'>('email');
	let name = $state('');
	let emailFrom = $state('');
	let emailTo = $state('');
	let botToken = $state('');
	let chatId = $state('');

	$effect(() => {
		if (open) return;
		type = channel?.type ?? 'email';
		name = channel?.name ?? '';
		botToken = '';
		if (channel?.type === 'email') {
			const cfg = channel.config as PublicEmailChannelConfig;
			emailFrom = cfg.from;
			emailTo = cfg.to;
			chatId = '';
		} else if (channel?.type === 'telegram') {
			const cfg = channel.config as PublicTelegramChannelConfig;
			emailFrom = '';
			emailTo = '';
			chatId = String(cfg.chat_id);
		} else {
			emailFrom = '';
			emailTo = '';
			chatId = '';
		}
	});
</script>

<Dialog bind:open>
	<DialogTrigger>
		{@render trigger()}
	</DialogTrigger>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>{isEdit ? 'Edit channel' : 'New channel'}</DialogTitle>
			<DialogDescription>
				{isEdit
					? 'Update this notification channel.'
					: 'Channels receive the daily digest when app-registrations fire.'}
			</DialogDescription>
		</DialogHeader>

		<form
			method="POST"
			action={isEdit ? '?/update' : '?/create'}
			use:enhance={() => async ({ result }) => {
				if (result.type === 'success') {
					toast.success(isEdit ? 'Channel updated' : 'Channel created');
					open = false;
					await invalidateAll();
				} else if (result.type === 'failure') {
					toast.error(String(result.data?.error ?? 'Save failed'));
				}
			}}
			class="flex flex-col gap-4"
		>
			{#if isEdit}
				<input type="hidden" name="id" value={channel?.id} />
			{/if}

			<div class="flex flex-col gap-2">
				<Label for="channel-type">Type</Label>
				<Select type="single" bind:value={type}>
					<SelectTrigger id="channel-type">
						{type === 'email' ? 'Email' : 'Telegram'}
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="email">Email</SelectItem>
						<SelectItem value="telegram">Telegram</SelectItem>
					</SelectContent>
				</Select>
				<input type="hidden" name="type" value={type} />
			</div>

			<div class="flex flex-col gap-2">
				<Label for="channel-name">Name</Label>
				<Input id="channel-name" name="name" bind:value={name} placeholder="Ops team" required />
			</div>

			{#if type === 'email'}
				<div class="flex flex-col gap-2">
					<Label for="channel-email-from">Send from</Label>
					<Input
						id="channel-email-from"
						name="from"
						type="email"
						bind:value={emailFrom}
						placeholder="vigiltra@yourdomain.com"
						required
					/>
					<p class="text-muted-foreground text-xs">
						Must be an address on a domain verified in Cloudflare Email Sending.
					</p>
				</div>
				<div class="flex flex-col gap-2">
					<Label for="channel-email-to">Send to</Label>
					<Input
						id="channel-email-to"
						name="to"
						type="email"
						bind:value={emailTo}
						placeholder="alerts@example.com"
						required
					/>
				</div>
			{:else}
				<div class="flex flex-col gap-2">
					<Label for="channel-bot-token">Bot token</Label>
					<Input
						id="channel-bot-token"
						name="bot_token"
						type="password"
						bind:value={botToken}
						placeholder={isEdit ? 'Leave blank to keep the existing token' : '123456:ABC-DEF…'}
						autocomplete="off"
						required={!isEdit}
					/>
					{#if isEdit}
						<p class="text-muted-foreground text-xs">
							The current bot token is not shown. Leave this blank to keep it.
						</p>
					{/if}
				</div>
				<div class="flex flex-col gap-2">
					<Label for="channel-chat-id">Chat ID</Label>
					<Input
						id="channel-chat-id"
						name="chat_id"
						type="text"
						inputmode="numeric"
						pattern="-?[0-9]+"
						bind:value={chatId}
						placeholder="-1001234567890"
						required
					/>
					<p class="text-muted-foreground text-xs">
						Negative IDs are supported for groups and channels.
					</p>
				</div>
			{/if}

			<DialogFooter>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit">{isEdit ? 'Save' : 'Create'}</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
