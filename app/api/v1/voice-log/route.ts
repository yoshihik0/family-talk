import { requireHost } from '@/lib/auth/authorize';

// 音声入力の不具合を実物で追うための一時的な受け口。
// 端末の中でしか起きないことなので、記録を送ってもらって wrangler tail で読む。
// 管理者以外からは受け付けないので、他の家族の発話が記録に残ることはない。
// 原因が判明したら、このルートごと削除する。
export async function POST(request: Request) {
  const auth = await requireHost(request);
  if ('error' in auth) return auth.error;

  const body = await request.text();
  console.log(`[voice-log] ${auth.session.displayName} ${body.slice(0, 12000)}`);
  return Response.json({ ok: true });
}
