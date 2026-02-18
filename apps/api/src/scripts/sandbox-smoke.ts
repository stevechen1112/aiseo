import 'dotenv/config';

import { DockerSandboxRunner } from '@aiseo/core';

import { env } from '../config/env.js';

async function main() {
  void env; // keep env loaded for parity with other scripts

  const workspacePath = process.argv[2] ?? process.cwd();

  const runner = new DockerSandboxRunner({
    image: 'aiseo-agent-sandbox',
    cpus: 1,
    memoryMb: 512,
    networkMode: 'none',
    mountMode: 'read-only',
  });

  const out = await runner.run({
    workspacePath,
    command: ['node', '-e', "console.log('sandbox ok'); console.log('cwd=' + process.cwd())"],
    timeoutMs: 30_000,
  });

  // eslint-disable-next-line no-console
  console.log(out);
}

await main();
