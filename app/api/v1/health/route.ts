// package.json の version を vite が埋め込む(vite.config.ts の define)。
declare const __APP_VERSION__: string;

export async function GET() {
  return Response.json({
    name: 'family-talk',
    status: 'ok',
    version: __APP_VERSION__,
    apiVersion: 'v1',
    schemaVersion: 1,
    capabilities: ['spaces', 'collections', 'records', 'events', 'push-subscriptions'],
  });
}
