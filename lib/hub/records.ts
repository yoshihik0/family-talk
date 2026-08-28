import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { getDb } from '@/db';
import { records } from '@/db/schema';
import type { CreateRecordInput, ListRecordsInput } from './types';

export async function createRecord(input: CreateRecordInput) {
  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    collectionId: input.collectionId,
    createdBy: input.createdBy,
    kind: input.kind ?? 'document',
    status: 'active',
    schemaVersion: input.schemaVersion ?? 1,
    data: input.data,
    searchableText: input.searchableText ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await getDb().insert(records).values(row);
  return row;
}

export async function listRecords(input: ListRecordsInput) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const filters = [eq(records.collectionId, input.collectionId), isNull(records.deletedAt)];

  if (input.kind) filters.push(eq(records.kind, input.kind));
  if (input.before) filters.push(lt(records.createdAt, input.before));

  return getDb()
    .select()
    .from(records)
    .where(and(...filters))
    .orderBy(desc(records.createdAt))
    .limit(limit);
}
