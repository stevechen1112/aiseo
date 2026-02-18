import 'dotenv/config';

async function http<T>(method: string, url: string, token: string | null, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${url} -> ${res.status} ${res.statusText}: ${text}`);
  }

  return JSON.parse(text) as T;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3001';
  const seedKeyword = process.env.SEED_KEYWORD ?? 'aiseo';

  const email = process.env.E2E_EMAIL ?? `e2e_${Date.now()}@example.com`;
  const password = process.env.E2E_PASSWORD ?? 'password1234';
  const name = process.env.E2E_NAME ?? 'E2E';

  const register = await http<{ ok: true; token: string; user: { tenantId: string; projectId: string } }>(
    'POST',
    `${baseUrl}/api/auth/register`,
    null,
    { email, password, name },
  );

  const token = register.token;
  const projectId = register.user.projectId;

  await http('POST', `${baseUrl}/api/flows/start`, token, {
    flowName: 'seo-content-pipeline',
    projectId,
    seedKeyword,
  });

  await sleep(3000);

  await http('POST', `${baseUrl}/api/serp/track-project`, token, { projectId, locale: 'zh-TW' });

  await sleep(4000);

  const ranks = await http<{ ok: boolean; rows: unknown[] }>(
    'GET',
    `${baseUrl}/api/serp/ranks?projectId=${projectId}&limit=20`,
    token,
  );

  // eslint-disable-next-line no-console
  console.log({ ok: true, rows: ranks.rows.length });
}

await main();
