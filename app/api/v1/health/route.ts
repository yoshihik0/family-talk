export async function GET() {
  return Response.json({
    name: 'personal-data-hub',
    status: 'ok',
    apiVersion: 'v1',
    schemaVersion: 1,
    capabilities: ['spaces', 'collections', 'records', 'events', 'push-subscriptions'],
  });
}
