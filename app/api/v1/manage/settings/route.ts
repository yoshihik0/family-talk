import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { identities, spaceMembers, spaces, type JsonObject } from '@/db/schema';
import { getDeviceSession } from '@/lib/auth/session';
import { requireHostForSpace } from '@/lib/auth/authorize';

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as {
    spaceId?: unknown;
    memberId?: unknown;
    avatarLabel?: unknown;
    avatarColor?: unknown;
    name?: unknown;
    policy?: { allowImage?: unknown; allowAudio?: unknown };
  } | null;
  const session = await getDeviceSession(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const spaceId = typeof body?.spaceId === 'string' ? body.spaceId : session.spaceId;
  const auth = await requireHostForSpace(request, spaceId);
  if ('error' in auth) return auth.error;

  if (typeof body?.memberId === 'string') {
    const label = typeof body.avatarLabel === 'string' ? body.avatarLabel.trim() : '';
    const color = typeof body.avatarColor === 'string' ? body.avatarColor : '';
    if (Array.from(label).length !== 1 || !/^#[0-9a-f]{6}$/i.test(color)) return Response.json({ error: 'invalid_member_profile' }, { status: 400 });
    const [member] = await getDb().select({ metadata: identities.metadata }).from(spaceMembers)
      .innerJoin(identities, eq(spaceMembers.identityId, identities.id))
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.identityId, body.memberId))).limit(1);
    if (!member) return Response.json({ error: 'member_not_found' }, { status: 404 });
    await getDb().update(identities).set({ metadata: { ...(member.metadata ?? {}), avatarLabel: label, avatarColor: color }, updatedAt: new Date() }).where(eq(identities.id, body.memberId));
    return Response.json({ member: { id: body.memberId, avatarLabel: label, avatarColor: color } });
  }

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 40) return Response.json({ error: 'invalid_name' }, { status: 400 });

  const current = (session.settings ?? {}) as JsonObject;
  const settings: JsonObject = {
    ...current,
    policy: {
      allowText: true,
      allowImage: Boolean(body?.policy?.allowImage),
      allowAudio: Boolean(body?.policy?.allowAudio),
    },
  };

  await getDb()
    .update(spaces)
    .set({ name, settings, updatedAt: new Date() })
    .where(eq(spaces.id, spaceId));

  return Response.json({ space: { id: spaceId, name, settings } });
}
