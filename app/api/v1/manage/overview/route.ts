import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { identities, spaceMembers, spaces } from '@/db/schema';
import { getDeviceSession } from '@/lib/auth/session';

export async function GET(request: Request) {
  const session = await getDeviceSession(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const requestedSpaceId = new URL(request.url).searchParams.get('spaceId') ?? session.spaceId;
  const managedSpaces = await getDb().select({ id: spaces.id, name: spaces.name, type: spaces.type, settings: spaces.settings })
    .from(spaceMembers).innerJoin(spaces, eq(spaceMembers.spaceId, spaces.id))
    .where(and(eq(spaceMembers.identityId, session.identityId), inArray(spaceMembers.role, ['owner', 'host'])))
    .orderBy(spaces.createdAt);
  const selected = managedSpaces.find((space) => space.id === requestedSpaceId);
  if (!selected) return Response.json({ error: 'forbidden' }, { status: 403 });

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
    .where(eq(spaceMembers.spaceId, selected.id))
    .orderBy(spaceMembers.createdAt);

  return Response.json({
    space: {
      ...selected,
    },
    me: {
      id: session.identityId,
      displayName: session.displayName,
      role: (await getDb().select({ role: spaceMembers.role }).from(spaceMembers).where(and(eq(spaceMembers.spaceId, selected.id), eq(spaceMembers.identityId, session.identityId))).limit(1))[0]?.role ?? 'member',
    },
    spaces: managedSpaces,
    members,
  });
}
