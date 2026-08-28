import JoinClient from './join-client';

export const metadata = { title: '家族のおしゃべりに参加' };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <JoinClient token={token} />;
}
