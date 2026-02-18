import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import type { ToolContext, ToolDefinition } from '../registry.js';

function resolvePathInWorkspace(workspacePath: string, inputPath: string): string {
  const target = isAbsolute(inputPath) ? resolve(inputPath) : resolve(workspacePath, inputPath);
  const rel = relative(workspacePath, target);

  // Prevent escaping via '..' or different drive/root.
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Path is outside of workspace');
  }

  return target;
}

export type ReadFileInput = {
  path: string;
  encoding?: BufferEncoding;
};

export type ReadFileOutput = {
  path: string;
  text: string;
};

export const fsReadFileTool: ToolDefinition<ReadFileInput, ReadFileOutput> = {
  id: 'fs.readFile',
  description: 'Read a file as text (read-only).',
  permissions: {
    fileSystem: 'read-only',
  },
  execute: async (input, ctx: ToolContext) => {
    const safePath = resolvePathInWorkspace(ctx.workspacePath, input.path);
    const text = await readFile(safePath, { encoding: input.encoding ?? 'utf-8' });
    return { path: safePath, text };
  },
};

export type WriteFileInput = {
  path: string;
  text: string;
  encoding?: BufferEncoding;
};

export type WriteFileOutput = {
  path: string;
  bytesWritten: number;
};

export const fsWriteFileTool: ToolDefinition<WriteFileInput, WriteFileOutput> = {
  id: 'fs.writeFile',
  description: 'Write a file as text (requires read-write).',
  permissions: {
    fileSystem: 'read-write',
  },
  execute: async (input, ctx: ToolContext) => {
    const toolAllowsWrite = fsWriteFileTool.permissions.fileSystem === 'read-write';
    const policyAllowsWrite = ctx.toolPolicy?.fileSystem ? ctx.toolPolicy.fileSystem === 'read-write' : true;
    if (!toolAllowsWrite || !policyAllowsWrite) {
      throw new Error('File system write not allowed');
    }

    const safePath = resolvePathInWorkspace(ctx.workspacePath, input.path);
    await writeFile(safePath, input.text, { encoding: input.encoding ?? 'utf-8' });

    const bytesWritten = Buffer.byteLength(input.text, input.encoding ?? 'utf-8');
    return { path: safePath, bytesWritten };
  },
};
