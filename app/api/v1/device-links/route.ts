import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { deviceLinks, spaceMembers } from '@/db/schema';
import { createOpaqueToken, getDeviceSession, hashToken } from '@/lib/auth/session';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { spaceId?: unknown } | null;
  const spaceId = typeof body?.spaceId === 'string' ? body.spaceId : '';
  const session = await getDeviceSession(request, spaceId || undefined);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const [membership] = await getDb().select({ id: spaceMembers.id }).from(spaceMembers).where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.identityId, session.identityId))).limit(1);
  if (!membership) return Response.json({ error: 'forbidden' }, { status: 403 });
  const token = createOpaqueToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
  await getDb().insert(deviceLinks).values({ id: crypto.randomUUID(), spaceId, identityId: session.identityId, tokenHash: await hashToken(token), expiresAt, usedAt: null, createdAt: now });
  return Response.json({ deviceUrl: `${new URL(request.url).origin}/device/${token}`, expiresAt: expiresAt.toISOString() }, { status: 201 });
}
