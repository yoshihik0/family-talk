import { getDb } from '@/db';
import { events } from '@/db/schema';
import { requireHost } from '@/lib/auth/authorize';

// 音声入力の不具合を実物で追うための一時的な受け口。
// 端末の中でしか起きないことなので、記録を受け取って events に残し、あとから読む。
// 管理者以外からは受け付けないので、他の家族の発話が記録されることはない。
// 原因が判明したら、このルートごと削除する。
export async function POST(request: Request) {
  const auth = await requireHost(request);
  if ('error' in auth) return auth.error;

  const body = await request.text();
  await getDb().insert(events).values({
    id: crypto.randomUUID(),
    spaceId: auth.session.spaceId,
    type: 'voice.log',
    actorId: auth.session.identityId,
    subjectType: 'voice',
    subjectId: 'diagnostics',
    payload: { log: body.slice(0, 60000) },
    createdAt: new Date(),
  });
  return Response.json({ ok: true });
}
