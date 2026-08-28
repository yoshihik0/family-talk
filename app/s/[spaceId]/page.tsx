import ChatClient from '@/app/chat-client';

export default async function SpacePage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  return <><link rel="manifest" href={`/api/v1/app-manifest?spaceId=${encodeURIComponent(spaceId)}`} /><ChatClient fixedSpaceId={spaceId} /></>;
}
