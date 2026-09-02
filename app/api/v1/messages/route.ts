import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { collections, events, identities, records, spaceMembers } from '@/db/schema';
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
const MESSAGES_PAGE_SIZE = 50;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const beforeParam = url.searchParams.get('before');
  const before = beforeParam && !Number.isNaN(Date.parse(beforeParam)) ? new Date(beforeParam) : undefined;
  const session = await getDeviceSession(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const spaceId = session.spaceId;
  const collection = await getMessageCollection(spaceId);
  if (!collection) return Response.json({ error: 'messages_collection_not_found' }, { status: 404 });

  // 管理者の名前は、ログイン情報を失ったときの案内文に使うため端末に控えてもらう。
  // 15秒ごとのポーリングでは要らないので、初回読み込みのときだけ返す。
  const admins = url.searchParams.get('withAdmins') === '1'
    ? (await getDb().select({ displayName: identities.displayName })
        .from(spaceMembers)
        .innerJoin(identities, eq(spaceMembers.identityId, identities.id))
        .where(and(eq(spaceMembers.spaceId, spaceId), inArray(spaceMembers.role, ['owner', 'host'])))
      ).map((admin) => admin.displayName)
    : undefined;

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
  const response = Response.json({
    space: { id: session.spaceId, name: session.spaceName, settings: session.settings },
    me: { id: session.identityId, displayName: session.displayName, role: session.role, metadata: session.identityMetadata },
    admins,
    messages,
    hasMore,
  });
  // 会話画面を開いているあいだに、端末のCookieの有効期限も一緒に延ばしておく。
  // ここを通らないと、使い続けていても端末側からトークンが消えてしまう。
  if (session.renewedCookie) response.headers.append('Set-Cookie', session.renewedCookie);
  return response;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { text?: unknown; spaceId?: unknown } | null;
  const session = await getDeviceSession(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role === 'viewer') return Response.json({ error: 'forbidden' }, { status: 403 });
  const spaceId = session.spaceId;

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
  const session = await getDeviceSession(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const spaceId = session.spaceId;
  const messageId = url.searchParams.get('messageId');
  if (!messageId) return Response.json({ error: 'message_id_required' }, { status: 400 });
  const isAdmin = session.role === 'owner' || session.role === 'host';
  const collection = await getMessageCollection(spaceId);
  if (!collection) return Response.json({ error: 'messages_collection_not_found' }, { status: 404 });
  const filters = [eq(records.id, messageId), eq(records.collectionId, collection.id), isNull(records.deletedAt)];
  if (!isAdmin) filters.push(eq(records.createdBy, session.identityId));
  const [message] = await getDb().select().from(records).where(and(...filters)).limit(1);
  if (!message) return Response.json({ error: 'message_not_found' }, { status: 404 });
  // 管理者は自分以外の発言も、期限を気にせず削除できる。本人はこれまで通り1日以内のみ。
  if (!isAdmin && Date.now() - message.createdAt.getTime() > 24 * 60 * 60 * 1000) return Response.json({ error: 'message_delete_window_expired' }, { status: 403 });
  const now = new Date();
  await getDb().update(records).set({ status: 'deleted', deletedAt: now, updatedAt: now }).where(eq(records.id, messageId));
  return Response.json({ deleted: messageId });
}
