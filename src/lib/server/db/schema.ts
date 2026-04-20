import { relations, sql } from 'drizzle-orm';
import { check, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// --- JSON column types -------------------------------------------------------

export type EmailChannelConfig = { to: string; from: string };
export type TelegramChannelConfig = { bot_token: string; chat_id: number };
export type ChannelConfig = EmailChannelConfig | TelegramChannelConfig;

export type ThresholdSchedule = {
	fires: number[];
	notify_past_expiry: boolean;
};

export type NotificationRunSummary = {
	credentials_fired: number;
	channels_hit: number;
	errors: string[];
};

// --- Helpers -----------------------------------------------------------------

const nowSecs = sql`(unixepoch())`;

// --- Config tables -----------------------------------------------------------

export const notificationChannels = sqliteTable('notification_channels', {
	id: text().primaryKey(),
	name: text().notNull(),
	type: text({ enum: ['email', 'telegram'] }).notNull(),
	config: text({ mode: 'json' }).$type<ChannelConfig>().notNull(),
	createdAt: integer({ mode: 'timestamp' }).notNull().default(nowSecs),
	updatedAt: integer({ mode: 'timestamp' })
		.notNull()
		.default(nowSecs)
		.$onUpdate(() => new Date())
});

export const thresholdTemplates = sqliteTable('threshold_templates', {
	id: text().primaryKey(),
	name: text().notNull(),
	isBuiltin: integer({ mode: 'boolean' }).notNull().default(false),
	schedule: text({ mode: 'json' }).$type<ThresholdSchedule>().notNull(),
	createdAt: integer({ mode: 'timestamp' }).notNull().default(nowSecs),
	updatedAt: integer({ mode: 'timestamp' })
		.notNull()
		.default(nowSecs)
		.$onUpdate(() => new Date())
});

export const appRegOverrides = sqliteTable('app_reg_overrides', {
	appObjectId: text()
		.primaryKey()
		.references(() => appRegistrations.objectId, { onDelete: 'cascade' }),
	appId: text().notNull(),
	monitoringEnabled: integer({ mode: 'boolean' }).notNull().default(true),
	templateId: text().references(() => thresholdTemplates.id, { onDelete: 'set null' }),
	channelOverrideIds: text({ mode: 'json' }).$type<string[]>(),
	createdAt: integer({ mode: 'timestamp' }).notNull().default(nowSecs),
	updatedAt: integer({ mode: 'timestamp' })
		.notNull()
		.default(nowSecs)
		.$onUpdate(() => new Date())
});

export const globalConfig = sqliteTable(
	'global_config',
	{
		id: integer().primaryKey(),
		defaultTemplateId: text().references(() => thresholdTemplates.id, {
			onDelete: 'set null'
		}),
		globalChannelIds: text({ mode: 'json' })
			.$type<string[]>()
			.notNull()
			.default(sql`(json('[]'))`),
		updatedAt: integer({ mode: 'timestamp' })
			.notNull()
			.default(nowSecs)
			.$onUpdate(() => new Date())
	},
	(t) => [check('global_config_singleton', sql`${t.id} = 1`)]
);

export const notificationRuns = sqliteTable('notification_runs', {
	runDate: text().primaryKey(),
	status: text({ enum: ['pending', 'completed', 'failed'] }).notNull(),
	summary: text({ mode: 'json' }).$type<NotificationRunSummary>(),
	startedAt: integer({ mode: 'timestamp' }),
	completedAt: integer({ mode: 'timestamp' })
});

// --- Graph cache tables ------------------------------------------------------

export const appRegistrations = sqliteTable('app_registrations', {
	objectId: text().primaryKey(),
	appId: text().notNull(),
	displayName: text().notNull(),
	kind: text({ enum: ['app_registration', 'enterprise_app'] })
		.notNull()
		.default('app_registration'),
	hasSamlSso: integer({ mode: 'boolean' }).notNull().default(false),
	preferredSigningKeyThumbprint: text(),
	createdDateTime: integer({ mode: 'timestamp' }),
	refreshedAt: integer({ mode: 'timestamp' }).notNull()
});

export const credentials = sqliteTable(
	'credentials',
	{
		appObjectId: text()
			.notNull()
			.references(() => appRegistrations.objectId, { onDelete: 'cascade' }),
		keyId: text().notNull(),
		kind: text({ enum: ['secret', 'certificate'] }).notNull(),
		displayName: text(),
		startDateTime: integer({ mode: 'timestamp' }),
		endDateTime: integer({ mode: 'timestamp' }),
		hint: text(),
		usage: text(),
		keyType: text(),
		customKeyIdentifier: text(),
		superseded: integer({ mode: 'boolean' }).notNull().default(false)
	},
	(t) => [primaryKey({ columns: [t.appObjectId, t.keyId] })]
);

export const refreshStatus = sqliteTable(
	'refresh_status',
	{
		id: integer().primaryKey(),
		lastRefreshStartedAt: integer({ mode: 'timestamp' }),
		lastRefreshCompletedAt: integer({ mode: 'timestamp' }),
		lastRefreshStatus: text({ enum: ['pending', 'success', 'failed'] }),
		lastRefreshError: text(),
		appRegCount: integer(),
		credentialCount: integer()
	},
	(t) => [check('refresh_status_singleton', sql`${t.id} = 1`)]
);

// --- Relations ---------------------------------------------------------------

export const appRegistrationsRelations = relations(appRegistrations, ({ many, one }) => ({
	credentials: many(credentials),
	override: one(appRegOverrides, {
		fields: [appRegistrations.objectId],
		references: [appRegOverrides.appObjectId]
	})
}));

export const credentialsRelations = relations(credentials, ({ one }) => ({
	appRegistration: one(appRegistrations, {
		fields: [credentials.appObjectId],
		references: [appRegistrations.objectId]
	})
}));

export const appRegOverridesRelations = relations(appRegOverrides, ({ one }) => ({
	template: one(thresholdTemplates, {
		fields: [appRegOverrides.templateId],
		references: [thresholdTemplates.id]
	}),
	appRegistration: one(appRegistrations, {
		fields: [appRegOverrides.appObjectId],
		references: [appRegistrations.objectId]
	})
}));

export const globalConfigRelations = relations(globalConfig, ({ one }) => ({
	defaultTemplate: one(thresholdTemplates, {
		fields: [globalConfig.defaultTemplateId],
		references: [thresholdTemplates.id]
	})
}));

// --- Inferred types ----------------------------------------------------------

export type NotificationChannel = typeof notificationChannels.$inferSelect;
export type NewNotificationChannel = typeof notificationChannels.$inferInsert;

// --- Public projections (safe to return to the browser) ---------------------

export type PublicEmailChannelConfig = { to: string; from: string };
export type PublicTelegramChannelConfig = { chat_id: number };
export type PublicChannelConfig = PublicEmailChannelConfig | PublicTelegramChannelConfig;
export type PublicNotificationChannel = Omit<NotificationChannel, 'config'> & {
	config: PublicChannelConfig;
};

export function toPublicChannel(c: NotificationChannel): PublicNotificationChannel {
	if (c.type === 'email') {
		const cfg = c.config as EmailChannelConfig;
		return { ...c, config: { from: cfg.from, to: cfg.to } };
	}
	const cfg = c.config as TelegramChannelConfig;
	return { ...c, config: { chat_id: cfg.chat_id } };
}
export type ThresholdTemplate = typeof thresholdTemplates.$inferSelect;
export type NewThresholdTemplate = typeof thresholdTemplates.$inferInsert;
export type AppRegOverride = typeof appRegOverrides.$inferSelect;
export type NewAppRegOverride = typeof appRegOverrides.$inferInsert;
export type GlobalConfig = typeof globalConfig.$inferSelect;
export type NotificationRun = typeof notificationRuns.$inferSelect;
export type AppRegistration = typeof appRegistrations.$inferSelect;
export type NewAppRegistration = typeof appRegistrations.$inferInsert;
export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;
export type RefreshStatus = typeof refreshStatus.$inferSelect;
