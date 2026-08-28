import { getDb } from '@/db';
import { collections, identities, records, spaceMembers, spaces } from '@/db/schema';

export const DEMO_IDENTITY_ID = 'identity_demo_yoshihiko';
const DEMO_MOTHER_ID = 'identity_demo_mother';
const DEMO_FATHER_ID = 'identity_demo_father';
export const DEMO_SPACE_ID = 'space_demo_family_home';
export const DEMO_COLLECTION_ID = 'collection_demo_messages';

export async function ensureDemoData() {
  const db = getDb();
  const now = new Date();

  await db.insert(identities).values({
    id: DEMO_IDENTITY_ID,
    kind: 'person',
    displayName: 'よしひこ',
    metadata: { avatarLabel: 'よ', avatarColor: '#3f7d61' },
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({ target: identities.id, set: { metadata: { avatarLabel: 'よ', avatarColor: '#3f7d61' } } });

  await db.insert(identities).values({
    id: DEMO_MOTHER_ID, kind: 'person', displayName: 'お母さん', metadata: { avatarLabel: '母', avatarColor: '#b45f45' }, createdAt: now, updatedAt: now,
  }).onConflictDoUpdate({ target: identities.id, set: { metadata: { avatarLabel: '母', avatarColor: '#b45f45' } } });

  await db.insert(identities).values({
    id: DEMO_FATHER_ID, kind: 'person', displayName: 'お父さん', metadata: { avatarLabel: '父', avatarColor: '#426f9a' }, createdAt: now, updatedAt: now,
  }).onConflictDoUpdate({ target: identities.id, set: { metadata: { avatarLabel: '父', avatarColor: '#426f9a' } } });

  await db.insert(spaces).values({
    id: DEMO_SPACE_ID,
    ownerId: DEMO_IDENTITY_ID,
    slug: 'demo-family-home',
    name: '実家',
    type: 'family-chat',
    settings: {
      theme: { primaryColor: '#2f6b4f', accentColor: '#e6f1ea' },
      policy: { allowText: true, allowImage: false, allowAudio: true },
    },
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await db.insert(spaceMembers).values({
    id: 'membership_demo_owner',
    spaceId: DEMO_SPACE_ID,
    identityId: DEMO_IDENTITY_ID,
    role: 'owner',
    capabilities: { records: ['read', 'create', 'update', 'delete'] },
    createdAt: now,
  }).onConflictDoNothing();

  await db.insert(spaceMembers).values([
    { id: 'membership_demo_mother', spaceId: DEMO_SPACE_ID, identityId: DEMO_MOTHER_ID, role: 'member', capabilities: { records: ['read', 'create'] }, createdAt: now },
    { id: 'membership_demo_father', spaceId: DEMO_SPACE_ID, identityId: DEMO_FATHER_ID, role: 'member', capabilities: { records: ['read', 'create'] }, createdAt: now },
  ]).onConflictDoNothing();

  await db.insert(collections).values({
    id: DEMO_COLLECTION_ID,
    spaceId: DEMO_SPACE_ID,
    key: 'messages',
    name: '家族のおしゃべり',
    recordType: 'message',
    schemaVersion: 1,
    jsonSchema: {
      type: 'object',
      required: ['text', 'senderName'],
      properties: {
        text: { type: 'string', maxLength: 2000 },
        senderName: { type: 'string' },
      },
    },
    settings: {},
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  const samples = [
    ['record_demo_1', DEMO_MOTHER_ID, 'お母さん', '今日はよく晴れています。午後に買い物へ行ってきます。', -51],
    ['record_demo_2', DEMO_IDENTITY_ID, 'よしひこ', 'いってらっしゃい。帰ったらひとこと知らせてね。', -45],
    ['record_demo_3', DEMO_FATHER_ID, 'お父さん', '庭の梅が咲きました。今度、写真を見せます。', -12],
  ] as const;

  for (const [id, createdBy, senderName, text, minutes] of samples) {
    const createdAt = new Date(now.getTime() + minutes * 60 * 1000);
    await db.insert(records).values({
      id,
      collectionId: DEMO_COLLECTION_ID,
      createdBy,
      kind: 'message',
      status: 'active',
      schemaVersion: 1,
      data: { text, senderName },
      searchableText: `${senderName} ${text}`,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    }).onConflictDoUpdate({
      target: records.id,
      set: { createdBy, data: { text, senderName }, searchableText: `${senderName} ${text}` },
    });
  }
}
