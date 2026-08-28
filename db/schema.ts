import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export type JsonObject = Record<string, unknown>;

export const identities = sqliteTable('identities', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['person', 'service'] }).notNull().default('person'),
  displayName: text('display_name').notNull(),
  metadata: text('metadata_json', { mode: 'json' }).$type<JsonObject>().notNull().default({}),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const spaces = sqliteTable('spaces', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => identities.id),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull().default('generic'),
  settings: text('settings_json', { mode: 'json' }).$type<JsonObject>().notNull().default({}),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('idx_spaces_slug').on(table.slug)]);

export const spaceMembers = sqliteTable('space_members', {
  id: text('id').primaryKey(),
  spaceId: text('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
  identityId: text('identity_id').notNull().references(() => identities.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'host', 'member', 'viewer', 'service'] }).notNull(),
  capabilities: text('capabilities_json', { mode: 'json' }).$type<JsonObject>().notNull().default({}),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  uniqueIndex('idx_space_members_space_identity').on(table.spaceId, table.identityId),
  index('idx_space_members_identity').on(table.identityId),
]);

export const invites = sqliteTable('invites', {
  id: text('id').primaryKey(),
  spaceId: text('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').notNull().references(() => identities.id),
  tokenHash: text('token_hash').notNull(),
  role: text('role', { enum: ['host', 'member', 'viewer'] }).notNull().default('member'),
  maxUses: integer('max_uses').notNull().default(1),
  usedCount: integer('used_count').notNull().default(0),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  uniqueIndex('idx_invites_token_hash').on(table.tokenHash),
  index('idx_invites_space').on(table.spaceId),
]);

export const deviceSessions = sqliteTable('device_sessions', {
  id: text('id').primaryKey(),
  identityId: text('identity_id').notNull().references(() => identities.id, { onDelete: 'cascade' }),
  spaceId: text('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  label: text('label'),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  uniqueIndex('idx_device_sessions_token_hash').on(table.tokenHash),
  index('idx_device_sessions_identity').on(table.identityId),
  index('idx_device_sessions_space').on(table.spaceId),
]);

export const collections = sqliteTable('collections', {
  id: text('id').primaryKey(),
  spaceId: text('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  name: text('name').notNull(),
  recordType: text('record_type').notNull().default('document'),
  schemaVersion: integer('schema_version').notNull().default(1),
  jsonSchema: text('json_schema', { mode: 'json' }).$type<JsonObject | null>(),
  settings: text('settings_json', { mode: 'json' }).$type<JsonObject>().notNull().default({}),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  uniqueIndex('idx_collections_space_key').on(table.spaceId, table.key),
  index('idx_collections_space').on(table.spaceId),
]);

export const records = sqliteTable('records', {
  id: text('id').primaryKey(),
  collectionId: text('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').notNull().references(() => identities.id),
  kind: text('kind').notNull().default('document'),
  status: text('status').notNull().default('active'),
  schemaVersion: integer('schema_version').notNull().default(1),
  data: text('data_json', { mode: 'json' }).$type<JsonObject>().notNull(),
  searchableText: text('searchable_text'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
}, (table) => [
  index('idx_records_collection_created').on(table.collectionId, table.createdAt),
  index('idx_records_collection_kind').on(table.collectionId, table.kind),
]);

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  spaceId: text('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  actorId: text('actor_id').references(() => identities.id),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id').notNull(),
  payload: text('payload_json', { mode: 'json' }).$type<JsonObject>().notNull().default({}),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('idx_events_space_created').on(table.spaceId, table.createdAt)]);

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id').primaryKey(),
  identityId: text('identity_id').notNull().references(() => identities.id, { onDelete: 'cascade' }),
  spaceId: text('space_id').references(() => spaces.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  uniqueIndex('idx_push_subscriptions_endpoint').on(table.endpoint),
  index('idx_push_subscriptions_identity').on(table.identityId),
]);
