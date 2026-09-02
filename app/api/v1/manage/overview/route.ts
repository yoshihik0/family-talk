import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { identities, spaceMembers, spaces, type JsonObject } from '@/db/schema';
import { getDeviceSession } from '@/lib/auth/session';

export async function GET(request: Request) {
  const session = await getDeviceSession(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const spaceId = session.spaceId;

  const [space] = await getDb().select({ name: spaces.name, settings: spaces.settings }).from(spaces).where(eq(spaces.id, spaceId)).limit(1);
  const appProfile = (space?.settings as JsonObject | undefined)?.appProfile as JsonObject | undefined;

  const members = await getDb()
    .select({
      id: identities.id,
      displayName: identities.displayName,
      role: spaceMembers.role,
      createdAt: spaceMembers.createdAt,
      metadata: identities.metadata,
    })
    .from(spaceMembers)
    .innerJoin(identities, eq(spaceMembers.identityId, identities.id))
    .where(eq(spaceMembers.spaceId, spaceId))
    .orderBy(spaceMembers.createdAt);

  // 管理者を一番上に表示する。
  members.sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0));

  return Response.json({
    viewerRole: session.role,
    viewerId: session.identityId,
    space: {
      id: spaceId,
      name: space?.name ?? '',
      icon: typeof appProfile?.icon === 'string' ? appProfile.icon : '🏡',
      color: typeof appProfile?.color === 'string' ? appProfile.color : '#3f7d61',
    },
    members: members.map(({ metadata, ...member }) => ({
      ...member,
      avatarLabel: typeof (metadata as JsonObject)?.avatarLabel === 'string' ? (metadata as JsonObject).avatarLabel : undefined,
      avatarColor: typeof (metadata as JsonObject)?.avatarColor === 'string' ? (metadata as JsonObject).avatarColor : undefined,
      voiceDuration: typeof (metadata as JsonObject)?.voiceDuration === 'number' ? (metadata as JsonObject).voiceDuration : undefined,
      canInvite: (metadata as JsonObject)?.canInvite === true,
    })),
  });
}
