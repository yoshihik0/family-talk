import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { collections, identities, records, spaces } from '@/db/schema';
import { requireHostForSpace } from '@/lib/auth/authorize';

function csvField(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function formatDateTime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export async function GET(request: Request) {
  const spaceId = new URL(request.url).searchParams.get('spaceId') ?? '';
  if (!spaceId) return Response.json({ error: 'space_id_required' }, { status: 400 });
  const auth = await requireHostForSpace(request, spaceId);
  if ('error' in auth) return auth.error;

  const [space] = await getDb().select({ name: spaces.name }).from(spaces).where(eq(spaces.id, spaceId)).limit(1);
  if (!space) return Response.json({ error: 'space_not_found' }, { status: 404 });

  const [collection] = await getDb()
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.spaceId, spaceId), eq(collections.key, 'messages')))
    .limit(1);

  // 削除済み(status/deletedAt)も含めて全件書き出す。会話画面はここから deletedAt が
  // 無いものだけを表示している。
  const rows = collection
    ? await getDb()
        .select({
          id: records.id,
          senderId: records.createdBy,
          data: records.data,
          createdAt: records.createdAt,
          deletedAt: records.deletedAt,
        })
        .from(records)
        .where(eq(records.collectionId, collection.id))
        .orderBy(asc(records.createdAt))
    : [];

  const senderIds = [...new Set(rows.map((row) => row.senderId))];
  const senderRows = senderIds.length
    ? await getDb().select({ id: identities.id, displayName: identities.displayName }).from(identities).where(inArray(identities.id, senderIds))
    : [];
  const senderMap = new Map(senderRows.map((sender) => [sender.id, sender.displayName]));

  const lines = ['日時,投稿者,削除,投稿内容'];
  for (const row of rows) {
    const senderName = senderMap.get(row.senderId) ?? '(不明)';
    const text = typeof row.data.text === 'string' ? row.data.text : '';
    lines.push([
      csvField(formatDateTime(row.createdAt)),
      csvField(senderName),
      csvField(row.deletedAt ? '削除' : ''),
      csvField(text),
    ].join(','));
  }

  const filename = `family-talk-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(`﻿${lines.join('\n')}\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
