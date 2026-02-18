import 'dotenv/config';

import autocannon from 'autocannon';

const baseUrl = process.env.LOADTEST_BASE_URL ?? 'http://127.0.0.1:3001';
const token = process.env.LOADTEST_TOKEN;

const connections = Number(process.env.LOADTEST_CONNECTIONS ?? 50);
const durationSeconds = Number(process.env.LOADTEST_DURATION_SECONDS ?? 20);

async function main() {
  if (!token) {
    throw new Error('Missing LOADTEST_TOKEN (Bearer access token)');
  }

  const url = `${baseUrl}/api/dashboard/metrics`;

  const result = await autocannon({
    url,
    connections,
    duration: durationSeconds,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  // eslint-disable-next-line no-console
  console.log(autocannon.printResult(result));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
