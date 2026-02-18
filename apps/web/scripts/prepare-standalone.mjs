import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');

const standaloneRoot = path.join(projectRoot, '.next', 'standalone', 'apps', 'web');
const destNextStatic = path.join(standaloneRoot, '.next', 'static');
const destPublic = path.join(standaloneRoot, 'public');

const srcNextStatic = path.join(projectRoot, '.next', 'static');
const srcPublic = path.join(projectRoot, 'public');

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  await fs.cp(src, dest, { recursive: true, force: true });
}

if (!(await exists(standaloneRoot))) {
  throw new Error(`Standalone output not found at: ${standaloneRoot}`);
}

if (await exists(srcNextStatic)) {
  await copyDir(srcNextStatic, destNextStatic);
} else {
  console.warn(`[prepare-standalone] Skipped: missing ${srcNextStatic}`);
}

if (await exists(srcPublic)) {
  await copyDir(srcPublic, destPublic);
}

console.log('[prepare-standalone] Prepared standalone assets');
