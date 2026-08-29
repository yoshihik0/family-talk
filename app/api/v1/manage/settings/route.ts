import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { identities, spaceMembers, spaces, type JsonObject } from '@/db/schema';
import { getDeviceSession } from '@/lib/auth/session';
import { requireHostForSpace } from '@/lib/auth/authorize';
import { isSingleGrapheme, splitGraphemes } from '@/lib/text/graphemes';

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as {
    spaceId?: unknown;
    memberId?: unknown;
    avatarLabel?: unknown;
    avatarColor?: unknown;
    members?: unknown;
    removeMemberId?: unknown;
    name?: unknown;
    appProfile?: { name?: unknown; icon?: unknown; color?: unknown };
    policy?: { voiceDuration?: unknown };
  } | null;
  const requestedSpaceId = typeof body?.spaceId === 'string' ? body.spaceId : '';
  const session = await getDeviceSession(request, requestedSpaceId || undefined);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const spaceId = requestedSpaceId || session.spaceId;
  const auth = await requireHostForSpace(request, spaceId);
  if ('error' in auth) return auth.error;

  if (typeof body?.removeMemberId === 'string') {
    if (body.removeMemberId === session.identityId) return Response.json({ error: 'cannot_remove_self' }, { status: 400 });
    const [member] = await getDb().select({ role: spaceMembers.role }).from(spaceMembers).where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.identityId, body.removeMemberId))).limit(1);
    if (!member) return Response.json({ error: 'member_not_found' }, { status: 404 });
    if (member.role === 'owner') return Response.json({ error: 'cannot_remove_owner' }, { status: 400 });
    await getDb().delete(spaceMembers).where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.identityId, body.removeMemberId)));
    return Response.json({ removed: body.removeMemberId });
  }

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

  if (Array.isArray(body?.members)) {
    const members = body.members as Array<{ id?: unknown; avatarLabel?: unknown; avatarColor?: unknown }>;
    for (const profile of members) {
      if (typeof profile.id !== 'string' || typeof profile.avatarLabel !== 'string' || Array.from(profile.avatarLabel.trim()).length !== 1 || typeof profile.avatarColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(profile.avatarColor)) {
        return Response.json({ error: 'invalid_member_profile' }, { status: 400 });
      }
      const [member] = await getDb().select({ metadata: identities.metadata }).from(spaceMembers).innerJoin(identities, eq(spaceMembers.identityId, identities.id)).where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.identityId, profile.id))).limit(1);
      if (!member) return Response.json({ error: 'member_not_found' }, { status: 404 });
      await getDb().update(identities).set({ metadata: { ...(member.metadata ?? {}), avatarLabel: profile.avatarLabel.trim(), avatarColor: profile.avatarColor }, updatedAt: new Date() }).where(eq(identities.id, profile.id));
    }
  }

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 40) return Response.json({ error: 'invalid_name' }, { status: 400 });

  const [space] = await getDb().select({ settings: spaces.settings }).from(spaces).where(eq(spaces.id, spaceId)).limit(1);
  if (!space) return Response.json({ error: 'space_not_found' }, { status: 404 });
  const current = (space.settings ?? {}) as JsonObject;
  const appName = typeof body?.appProfile?.name === 'string' ? body.appProfile.name.trim() : '';
  const appIcon = typeof body?.appProfile?.icon === 'string' ? body.appProfile.icon.trim() : '';
  const appColor = typeof body?.appProfile?.color === 'string' ? body.appProfile.color : '';
  if (!appName || splitGraphemes(appName).length > 4 || !isSingleGrapheme(appIcon) || !/^#[0-9a-f]{6}$/i.test(appColor)) {
    return Response.json({ error: 'invalid_app_profile' }, { status: 400 });
  }
  const requestedVoiceDuration = Number(body?.policy?.voiceDuration);
  const voiceDuration = requestedVoiceDuration === 15 || requestedVoiceDuration === 30 || requestedVoiceDuration === 60 ? requestedVoiceDuration : 30;
  const settings: JsonObject = {
    ...current,
    appProfile: { name: appName, icon: appIcon, color: appColor },
    policy: {
      allowText: true,
      allowAudio: true,
      voiceDuration,
    },
  };

  await getDb()
    .update(spaces)
    .set({ name, settings, updatedAt: new Date() })
    .where(eq(spaces.id, spaceId));

  return Response.json({ space: { id: spaceId, name, settings } });
}
