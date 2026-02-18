import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

export type WorkspaceOptions = {
  baseDir?: string;
  agentId: string;
  runId?: string;
};

export type WorkspaceHandle = {
  agentId: string;
  runId: string;
  path: string;
  cleanup: () => Promise<void>;
};

export async function createIsolatedWorkspace(options: WorkspaceOptions): Promise<WorkspaceHandle> {
  const runId = options.runId ?? randomUUID();
  const base = options.baseDir ?? join(tmpdir(), 'aiseo', 'workspaces');
  const workspacePath = join(base, options.agentId, runId);

  await mkdir(workspacePath, { recursive: true });

  return {
    agentId: options.agentId,
    runId,
    path: workspacePath,
    cleanup: async () => {
      await rm(workspacePath, { recursive: true, force: true });
    },
  };
}
