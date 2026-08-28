import DeviceLinkClient from './device-link-client';

export const metadata = { title: '別の端末で家族のおしゃべりを使う' };

export default async function DeviceLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <DeviceLinkClient token={token} />;
}
