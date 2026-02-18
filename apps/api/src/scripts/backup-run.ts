import 'dotenv/config';

import { runAutomatedBackupOnce } from '../backups/runner.js';

async function main() {
  const res = await runAutomatedBackupOnce();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(res, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
