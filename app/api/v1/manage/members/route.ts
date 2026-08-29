import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { spaceMembers } from '@/db/schema';
import { getDeviceSession } from '@/lib/auth/session';
import { requireHostForSpace } from '@/lib/auth/authorize';

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
