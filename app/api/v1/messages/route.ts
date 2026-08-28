import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { collections, events, identities } from '@/db/schema';
import { getDeviceSession } from '@/lib/auth/session';
import { createRecord, listRecords } from '@/lib/hub/records';

async function getMessageCollection(spaceId: string) {
  const [collection] = await getDb()
    .select()
    .from(collections)
    .where(and(eq(collections.spaceId, spaceId), eq(collections.key, 'messages')))
    .limit(1);
  return collection ?? null;
}

export async function GET(request: Request) {
  const session = await getDeviceSession(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const collection = await getMessageCollection(session.spaceId);
  if (!collection) return Response.json({ error: 'messages_collection_not_found' }, { status: 404 });

  const rows = await listRecords({ collectionId: collection.id, kind: 'message', limit: 100 });
  const senderIds = [...new Set(rows.map((row) => row.createdBy))];
  const senderRows = senderIds.length ? await getDb().select({ id: identities.id, metadata: identities.metadata }).from(identities).where(inArray(identities.id, senderIds)) : [];
  const senderMap = new Map(senderRows.map((sender) => [sender.id, sender.metadata]));
  const messages = rows.reverse().map((row) => ({
    id: row.id,
    senderId: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    ...row.data,
    avatarLabel: senderMap.get(row.createdBy)?.avatarLabel,
    avatarColor: senderMap.get(row.createdBy)?.avatarColor,
  }));

  return Response.json({
    space: { id: session.spaceId, name: session.spaceName, settings: session.settings },
    me: { id: session.identityId, displayName: session.displayName, role: session.role },
    messages,
  });
}

export async function POST(request: Request) {
  const session = await getDeviceSession(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role === 'viewer') return Response.json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json().catch(() => null) as { text?: unknown } | null;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 2000) {
    return Response.json({ error: 'invalid_message' }, { status: 400 });
  }

  const collection = await getMessageCollection(session.spaceId);
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
    spaceId: session.spaceId,
    type: 'record.created',
    actorId: session.identityId,
    subjectType: 'record',
    subjectId: record.id,
    payload: { collectionId: collection.id, kind: 'message' },
    createdAt: record.createdAt,
  });

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
