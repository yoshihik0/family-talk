import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { collections, events, identities, records, spaceMembers, spaces } from '@/db/schema';
import { isNull } from 'drizzle-orm';
import { getDeviceSession } from '@/lib/auth/session';
import { createRecord, listRecords } from '@/lib/hub/records';
import { notifySpaceMembers } from '@/lib/push/send';

async function getMessageCollection(spaceId: string) {
  const [collection] = await getDb()
    .select()
    .from(collections)
    .where(and(eq(collections.spaceId, spaceId), eq(collections.key, 'messages')))
    .limit(1);
  return collection ?? null;
}

async function getSpaceAccess(identityId: string, spaceId: string) {
  const [access] = await getDb().select({ spaceId: spaces.id, spaceName: spaces.name, settings: spaces.settings, role: spaceMembers.role })
    .from(spaceMembers).innerJoin(spaces, eq(spaceMembers.spaceId, spaces.id))
    .where(and(eq(spaceMembers.identityId, identityId), eq(spaceMembers.spaceId, spaceId))).limit(1);
  return access ?? null;
}

const MESSAGES_PAGE_SIZE = 50;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedSpaceId = url.searchParams.get('spaceId') ?? '';
  const beforeParam = url.searchParams.get('before');
  const before = beforeParam && !Number.isNaN(Date.parse(beforeParam)) ? new Date(beforeParam) : undefined;
  const session = await getDeviceSession(request, requestedSpaceId || undefined);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const spaceId = requestedSpaceId || session.spaceId;
  const access = await getSpaceAccess(session.identityId, spaceId);
  if (!access) return Response.json({ error: 'forbidden' }, { status: 403 });
  const collection = await getMessageCollection(spaceId);
  if (!collection) return Response.json({ error: 'messages_collection_not_found' }, { status: 404 });

  const rows = await listRecords({ collectionId: collection.id, kind: 'message', limit: MESSAGES_PAGE_SIZE + 1, before });
  const hasMore = rows.length > MESSAGES_PAGE_SIZE;
  const pageRows = hasMore ? rows.slice(0, MESSAGES_PAGE_SIZE) : rows;
  const senderIds = [...new Set(pageRows.map((row) => row.createdBy))];
  const senderRows = senderIds.length ? await getDb().select({ id: identities.id, metadata: identities.metadata }).from(identities).where(inArray(identities.id, senderIds)) : [];
  const senderMap = new Map(senderRows.map((sender) => [sender.id, sender.metadata]));
  const messages = pageRows.reverse().map((row) => ({
    id: row.id,
    senderId: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    ...row.data,
    avatarLabel: senderMap.get(row.createdBy)?.avatarLabel,
    avatarColor: senderMap.get(row.createdBy)?.avatarColor,
  }));
  return Response.json({
    space: { id: access.spaceId, name: access.spaceName, settings: access.settings },
    me: { id: session.identityId, displayName: session.displayName, role: access.role, metadata: session.identityMetadata },
    messages,
    hasMore,
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { text?: unknown; spaceId?: unknown } | null;
  const requestedSpaceId = typeof body?.spaceId === 'string' ? body.spaceId : '';
  const session = await getDeviceSession(request, requestedSpaceId || undefined);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const spaceId = requestedSpaceId || session.spaceId;
  const access = await getSpaceAccess(session.identityId, spaceId);
  if (!access || access.role === 'viewer') return Response.json({ error: 'forbidden' }, { status: 403 });

  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 2000) {
    return Response.json({ error: 'invalid_message' }, { status: 400 });
  }

  const collection = await getMessageCollection(spaceId);
  if (!collection) return Response.json({ error: 'messages_collection_not_found' }, { status: 404 });

  const record = await createRecord({
    collectionId: collection.id,
    createdBy: session.identityId,
    kind: 'message',
    data: { text, senderName: session.displayName },
    searchableText: `${session.displayName} ${text}`,
  });

  await getDb().insert(events).values({
    id: crypto.randomUUID(),
    spaceId,
    type: 'record.created',
    actorId: session.identityId,
    subjectType: 'record',
    subjectId: record.id,
    payload: { collectionId: collection.id, kind: 'message' },
    createdAt: record.createdAt,
  });

  await notifySpaceMembers(spaceId, session.identityId);

  return Response.json({
    message: {
      id: record.id,
      senderId: session.identityId,
      senderName: session.displayName,
      avatarLabel: session.identityMetadata?.avatarLabel,
      avatarColor: session.identityMetadata?.avatarColor,
      text,
      createdAt: record.createdAt.toISOString(),
    },
  }, { status: 201 });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const requestedSpaceId = url.searchParams.get('spaceId') ?? '';
  const session = await getDeviceSession(request, requestedSpaceId || undefined);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const spaceId = requestedSpaceId || session.spaceId;
  const messageId = url.searchParams.get('messageId');
  if (!messageId) return Response.json({ error: 'message_id_required' }, { status: 400 });
  const access = await getSpaceAccess(session.identityId, spaceId);
  if (!access) return Response.json({ error: 'forbidden' }, { status: 403 });
  const collection = await getMessageCollection(spaceId);
  if (!collection) return Response.json({ error: 'messages_collection_not_found' }, { status: 404 });
  const [message] = await getDb().select().from(records).where(and(eq(records.id, messageId), eq(records.collectionId, collection.id), eq(records.createdBy, session.identityId), isNull(records.deletedAt))).limit(1);
  if (!message) return Response.json({ error: 'message_not_found' }, { status: 404 });
  if (Date.now() - message.createdAt.getTime() > 30 * 60 * 1000) return Response.json({ error: 'message_delete_window_expired' }, { status: 403 });
  const now = new Date();
  await getDb().update(records).set({ status: 'deleted', deletedAt: now, updatedAt: now }).where(eq(records.id, messageId));
  return Response.json({ deleted: messageId });
}
