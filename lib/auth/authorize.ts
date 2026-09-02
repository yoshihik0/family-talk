import { getDeviceSession } from './session';

// 1デプロイ1グループなので、セッションが属するグループがそのまま対象になる。
// getDeviceSession が返す role は、そのグループでの役割を join して引いたもの。
export async function requireSession(request: Request) {
  const session = await getDeviceSession(request);
  if (!session) return { error: Response.json({ error: 'unauthorized' }, { status: 401 }) } as const;
  return { session } as const;
}

export async function requireHost(request: Request) {
  const session = await getDeviceSession(request);
  if (!session) return { error: Response.json({ error: 'unauthorized' }, { status: 401 }) } as const;
  if (session.role !== 'owner' && session.role !== 'host') {
    return { error: Response.json({ error: 'forbidden' }, { status: 403 }) } as const;
  }
  return { session, role: session.role } as const;
}
