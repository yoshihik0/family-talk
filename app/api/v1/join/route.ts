import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { identities, invites, spaceMembers, spaces, type JsonObject } from '@/db/schema';
import { createDeviceSession, hashToken, makeSessionCookie } from '@/lib/auth/session';

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  if (!token) return Response.json({ error: 'invalid_request' }, { status: 400 });

  const now = new Date();
  const [invite] = await getDb()
    .select({ spaceId: invites.spaceId })
    .from(invites)
    .where(and(
      eq(invites.tokenHash, await hashToken(token)),
      isNull(invites.revokedAt),
      gt(invites.expiresAt, now),
      lt(invites.usedCount, invites.maxUses),
    ))
    .limit(1);

  if (!invite) return Response.json({ error: 'invite_unavailable' }, { status: 410 });

  const [space] = await getDb().select({ name: spaces.name, settings: spaces.settings }).from(spaces).where(eq(spaces.id, invite.spaceId)).limit(1);
  const appProfile = ((space?.settings ?? {}) as JsonObject).appProfile as JsonObject | undefined;
  return Response.json({
    spaceName: space?.name ?? '',
    icon: typeof appProfile?.icon === 'string' ? appProfile.icon : '家',
    color: typeof appProfile?.color === 'string' ? appProfile.color : '#3f7d61',
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { token?: unknown; displayName?: unknown } | null;
  const token = typeof body?.token === 'string' ? body.token : '';
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  if (!token || !displayName || displayName.length > 30) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  const db = getDb();
  const now = new Date();
  const [claimedInvite] = await db
    .update(invites)
    .set({ usedCount: sql`${invites.usedCount} + 1` })
    .where(and(
      eq(invites.tokenHash, await hashToken(token)),
      isNull(invites.revokedAt),
      gt(invites.expiresAt, now),
      lt(invites.usedCount, invites.maxUses),
    ))
    .returning({ spaceId: invites.spaceId, role: invites.role });

  if (!claimedInvite) return Response.json({ error: 'invite_unavailable' }, { status: 410 });

  const identityId = crypto.randomUUID();
  await db.insert(identities).values({ id: identityId, kind: 'person', displayName, metadata: {}, createdAt: now, updatedAt: now });
  await db.insert(spaceMembers).values({ id: crypto.randomUUID(), spaceId: claimedInvite.spaceId, identityId, role: claimedInvite.role, capabilities: { records: ['read', 'create'] }, createdAt: now });

  const [space] = await db.select({ name: spaces.name }).from(spaces).where(eq(spaces.id, claimedInvite.spaceId)).limit(1);
  const { token: sessionToken, expiresAt } = await createDeviceSession(identityId, claimedInvite.spaceId, 'invited device');
  const response = Response.json({ ok: true, spaceId: claimedInvite.spaceId, spaceName: space?.name ?? '' });
  response.headers.append('Set-Cookie', makeSessionCookie(sessionToken, expiresAt, new URL(request.url).protocol === 'https:', claimedInvite.spaceId));
  return response;
}
