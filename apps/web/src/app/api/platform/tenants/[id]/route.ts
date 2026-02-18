import { NextResponse } from 'next/server';

function getApiBaseUrl() {
  return process.env.AISEO_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';
}

function getPlatformSecret() {
  return process.env.PLATFORM_ADMIN_SECRET;
}

async function proxy(req: Request, tenantId: string) {
  const secret = getPlatformSecret();
  if (!secret) {
    return NextResponse.json({ message: 'PLATFORM_ADMIN_SECRET not configured' }, { status: 501 });
  }

  const apiBase = getApiBaseUrl().replace(/\/$/, '');
  const target = `${apiBase}/api/platform/tenants/${encodeURIComponent(tenantId)}`;

  const headers = new Headers();
  headers.set('x-platform-admin-secret', secret);

  const auth = req.headers.get('authorization');
  if (auth) headers.set('authorization', auth);

  const contentType = req.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text(),
    cache: 'no-store',
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxy(req, id);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxy(req, id);
}
