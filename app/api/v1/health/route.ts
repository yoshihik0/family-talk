// package.json の version と手で合わせておく(Workers環境でのJSON importの
// バンドル差異を避けるため、ここでは定数として持つ)。
const APP_VERSION = '0.6.0';

export async function GET() {
  return Response.json({
    name: 'family-talk',
    status: 'ok',
    version: APP_VERSION,
    apiVersion: 'v1',
    schemaVersion: 1,
    capabilities: ['spaces', 'collections', 'records', 'events', 'push-subscriptions'],
  });
}
