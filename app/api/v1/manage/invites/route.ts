import { getDb } from '@/db';
import { invites } from '@/db/schema';
import { requireHostForSpace } from '@/lib/auth/authorize';
import { createOpaqueToken, getDeviceSession, hashToken } from '@/lib/auth/session';

export async function POST(request: Request) {
  const session = await getDeviceSession(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null) as { spaceId?: unknown } | null;
  const spaceId = typeof body?.spaceId === 'string' ? body.spaceId : session.spaceId;
  const auth = await requireHostForSpace(request, spaceId);
  if ('error' in auth) return auth.error;

  const token = createOpaqueToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  await getDb().insert(invites).values({
    id: crypto.randomUUID(),
    spaceId,
    createdBy: session.identityId,
    tokenHash: await hashToken(token),
    role: 'member',
    maxUses: 1,
    usedCount: 0,
    expiresAt,
    revokedAt: null,
    createdAt: now,
  });

  const origin = new URL(request.url).origin;
  return Response.json({
    inviteUrl: `${origin}/join/${token}`,
    expiresAt: expiresAt.toISOString(),
  }, { status: 201 });
}
