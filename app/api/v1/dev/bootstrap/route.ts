import { createDeviceSession, makeSessionCookie } from '@/lib/auth/session';
import { DEMO_IDENTITY_ID, DEMO_SPACE_ID, ensureDemoData } from '@/lib/hub/demo';

function isLocalRequest(request: Request) {
  const host = new URL(request.url).hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  await ensureDemoData();
  const { token, expiresAt } = await createDeviceSession(DEMO_IDENTITY_ID, DEMO_SPACE_ID, 'local preview');
  const response = Response.json({ ok: true });
  response.headers.append('Set-Cookie', makeSessionCookie(token, expiresAt, false));
  return response;
}
