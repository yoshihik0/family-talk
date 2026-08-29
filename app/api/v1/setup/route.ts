import { getDb } from '@/db';
import { collections, identities, spaceMembers, spaces } from '@/db/schema';
import { createDeviceSession, makeSessionCookie } from '@/lib/auth/session';
import { isSingleGrapheme } from '@/lib/text/graphemes';

// このデプロイに1つもグループが無いあいだだけ、誰でもここから最初のグループを作れる。
// 1つでもできたら、以後は誰であっても常に拒否する。
async function alreadySetUp() {
  const [existing] = await getDb().select({ id: spaces.id }).from(spaces).limit(1);
  return Boolean(existing);
}

export async function GET() {
  return Response.json({ needsSetup: !(await alreadySetUp()) });
}

export async function POST(request: Request) {
  if (await alreadySetUp()) return Response.json({ error: 'already_set_up' }, { status: 409 });

  const body = await request.json().catch(() => null) as { ownerName?: unknown; groupName?: unknown; icon?: unknown; color?: unknown } | null;
  const ownerName = typeof body?.ownerName === 'string' ? body.ownerName.trim() : '';
  const groupName = typeof body?.groupName === 'string' ? body.groupName.trim() : '';
  const icon = typeof body?.icon === 'string' && isSingleGrapheme(body.icon) ? body.icon.trim() : '🏡';
  const color = typeof body?.color === 'string' && /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : '#3f7d61';
  if (!ownerName || ownerName.length > 40 || !groupName || groupName.length > 40) {
    return Response.json({ error: 'invalid_input' }, { status: 400 });
  }

  const now = new Date();
  const identityId = crypto.randomUUID();
  const spaceId = crypto.randomUUID();
  const collectionId = crypto.randomUUID();
  const ownerLabel = Array.from(ownerName)[0] ?? '家';

  await getDb().insert(identities).values({
    id: identityId,
    kind: 'person',
    displayName: ownerName,
    metadata: { avatarLabel: ownerLabel, avatarColor: '#3f7d61' },
    createdAt: now,
    updatedAt: now,
  });
  await getDb().insert(spaces).values({
    id: spaceId,
    ownerId: identityId,
    slug: `space-${crypto.randomUUID()}`,
    name: groupName,
    type: 'family',
    settings: {
      appProfile: { name: Array.from(groupName).slice(0, 4).join(''), icon, color },
      policy: { allowText: true, allowAudio: true, voiceDuration: 30 },
    },
    createdAt: now,
    updatedAt: now,
  });
  await getDb().insert(spaceMembers).values({ id: crypto.randomUUID(), spaceId, identityId, role: 'owner', capabilities: {}, createdAt: now });
  await getDb().insert(collections).values({ id: collectionId, spaceId, key: 'messages', name: groupName, recordType: 'message', schemaVersion: 1, jsonSchema: null, settings: {}, createdAt: now, updatedAt: now });

  const { token, expiresAt } = await createDeviceSession(identityId, spaceId, 'initial setup');
  const response = Response.json({ ok: true, spaceId }, { status: 201 });
  const secure = new URL(request.url).protocol === 'https:';
  response.headers.append('Set-Cookie', makeSessionCookie(token, expiresAt, secure, spaceId));
  return response;
}
