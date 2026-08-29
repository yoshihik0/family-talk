import AdminToolsClient from './admin-tools-client';

export const metadata = { title: '管理ツール' };

export default async function AdminToolsPage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  return <AdminToolsClient spaceId={spaceId} />;
}
