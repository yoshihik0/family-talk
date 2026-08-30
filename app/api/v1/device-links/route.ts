import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { deviceLinks, spaceMembers } from '@/db/schema';
import { createOpaqueToken, getDeviceSession, hashToken } from '@/lib/auth/session';
import { requireHostForSpace } from '@/lib/auth/authorize';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { spaceId?: unknown; memberId?: unknown } | null;
  const spaceId = typeof body?.spaceId === 'string' ? body.spaceId : '';
  const session = await getDeviceSession(request, spaceId || undefined);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const requestedMemberId = typeof body?.memberId === 'string' ? body.memberId : session.identityId;
  let targetIdentityId = session.identityId;
  if (requestedMemberId !== session.identityId) {
    // 他のメンバー宛てのリンクは、管理者が代わりに発行できるようにする
    // (端末を失って自分ではログインできなくなったメンバーの救済用)。
    const auth = await requireHostForSpace(request, spaceId);
    if ('error' in auth) return auth.error;
    targetIdentityId = requestedMemberId;
  }

  const [membership] = await getDb().select({ id: spaceMembers.id }).from(spaceMembers).where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.identityId, targetIdentityId))).limit(1);
  if (!membership) return Response.json({ error: 'member_not_found' }, { status: 404 });

  const token = createOpaqueToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
  await getDb().insert(deviceLinks).values({ id: crypto.randomUUID(), spaceId, identityId: targetIdentityId, tokenHash: await hashToken(token), expiresAt, usedAt: null, createdAt: now });
  return Response.json({ deviceUrl: `${new URL(request.url).origin}/device/${token}`, expiresAt: expiresAt.toISOString() }, { status: 201 });
}
