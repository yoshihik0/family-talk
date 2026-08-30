import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { identities, spaceMembers, type JsonObject } from '@/db/schema';
import { getDeviceSession } from '@/lib/auth/session';
import { requireHostForSpace } from '@/lib/auth/authorize';
import { isSingleGrapheme } from '@/lib/text/graphemes';

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const requestedSpaceId = url.searchParams.get('spaceId') ?? '';
  const memberId = url.searchParams.get('memberId');
  const session = await getDeviceSession(request, requestedSpaceId || undefined);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const spaceId = requestedSpaceId || session.spaceId;
  const auth = await requireHostForSpace(request, spaceId);
  if ('error' in auth) return auth.error;
  if (!memberId) return Response.json({ error: 'member_id_required' }, { status: 400 });
  if (memberId === session.identityId) return Response.json({ error: 'cannot_remove_self' }, { status: 400 });

  const [member] = await getDb().select({ role: spaceMembers.role }).from(spaceMembers).where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.identityId, memberId))).limit(1);
  if (!member) return Response.json({ error: 'member_not_found' }, { status: 404 });
  if (member.role === 'owner') return Response.json({ error: 'cannot_remove_owner' }, { status: 400 });
  await getDb().delete(spaceMembers).where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.identityId, memberId)));
  return Response.json({ removed: memberId });
}

// 管理者が、他のメンバーの名前・アイコン・色・話す時間をリモートで直せるようにする。
// 高齢の家族が誤って設定を崩してしまった場合の救済策。
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as {
    spaceId?: unknown;
    memberId?: unknown;
    displayName?: unknown;
    avatarLabel?: unknown;
    avatarColor?: unknown;
    voiceDuration?: unknown;
    canInvite?: unknown;
  } | null;
  const requestedSpaceId = typeof body?.spaceId === 'string' ? body.spaceId : '';
  const auth = await requireHostForSpace(request, requestedSpaceId);
  if ('error' in auth) return auth.error;
  const spaceId = requestedSpaceId;
  const memberId = typeof body?.memberId === 'string' ? body.memberId : '';
  if (!memberId) return Response.json({ error: 'member_id_required' }, { status: 400 });

  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  const avatarLabel = typeof body?.avatarLabel === 'string' ? body.avatarLabel.trim() : '';
  const avatarColor = typeof body?.avatarColor === 'string' ? body.avatarColor : '';
  const requestedVoiceDuration = Number(body?.voiceDuration);
  const voiceDuration = requestedVoiceDuration === 15 || requestedVoiceDuration === 30 || requestedVoiceDuration === 60 ? requestedVoiceDuration : 30;
  const canInvite = body?.canInvite === true;
  if (!displayName || displayName.length > 40 || !isSingleGrapheme(avatarLabel) || !/^#[0-9a-f]{6}$/i.test(avatarColor)) {
    return Response.json({ error: 'invalid_member_profile' }, { status: 400 });
  }

  const [member] = await getDb().select({ metadata: identities.metadata }).from(spaceMembers)
    .innerJoin(identities, eq(spaceMembers.identityId, identities.id))
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.identityId, memberId))).limit(1);
  if (!member) return Response.json({ error: 'member_not_found' }, { status: 404 });

  await getDb().update(identities).set({
    displayName,
    metadata: { ...(member.metadata ?? {}), avatarLabel, avatarColor, voiceDuration, canInvite },
    updatedAt: new Date(),
  }).where(eq(identities.id, memberId));

  return Response.json({ member: { id: memberId, displayName, avatarLabel, avatarColor, voiceDuration, canInvite } });
}
