import { getDeviceSession } from './session';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { spaceMembers } from '@/db/schema';

export async function requireHostForSpace(request: Request, spaceId: string) {
  const session = await getDeviceSession(request, spaceId);
  if (!session) return { error: Response.json({ error: 'unauthorized' }, { status: 401 }) } as const;

  const [membership] = await getDb()
    .select({ role: spaceMembers.role })
    .from(spaceMembers)
    .where(and(
      eq(spaceMembers.spaceId, spaceId),
      eq(spaceMembers.identityId, session.identityId),
      inArray(spaceMembers.role, ['owner', 'host']),
    ))
    .limit(1);

  if (!membership) return { error: Response.json({ error: 'forbidden' }, { status: 403 }) } as const;
  return { session, role: membership.role } as const;
}
