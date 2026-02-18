import { spawn } from 'node:child_process';

export type SandboxMountMode = 'read-only' | 'read-write';

export type DockerSandboxOptions = {
  image: string;
  cpus?: number;
  memoryMb?: number;
  networkMode?: 'none' | 'bridge';
  mountMode?: SandboxMountMode;
  /**
   * When networkMode is 'bridge', only allow outbound connections to these
   * hostnames / IPs. Uses iptables inside the container to enforce.
   * If empty and networkMode is 'bridge', all outbound traffic is allowed.
   */
  networkWhitelist?: string[];
};

export type RunInSandboxInput = {
  workspacePath: string;
  command: string[];
  env?: Record<string, string>;
  timeoutMs?: number;
};

export type RunInSandboxOutput = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

/**
 * Generates an entrypoint script that sets up iptables rules to whitelist
 * only specific hostnames/IPs, then executes the original command.
 */
function buildWhitelistEntrypoint(whitelist: string[], command: string[]): string[] {
  if (whitelist.length === 0) return command;

  // Build iptables rules: allow DNS (53), allow loopback, allow whitelist, drop rest
  const rules: string[] = [
    'iptables -A OUTPUT -o lo -j ACCEPT',
    'iptables -A OUTPUT -p udp --dport 53 -j ACCEPT',  // Allow DNS
    'iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT',
    'iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT',
  ];

  for (const entry of whitelist) {
    // Support hostname or IP — iptables -d accepts both
    rules.push(`iptables -A OUTPUT -d ${entry} -j ACCEPT`);
  }

  rules.push('iptables -A OUTPUT -j DROP'); // Default: drop all other outbound

  const escaped = command.map((c) => `'${c.replace(/'/g, "'\\''")}'`).join(' ');
  const script = `${rules.join(' && ')} && exec ${escaped}`;

  return ['sh', '-c', script];
}

export class DockerSandboxRunner {
  constructor(private readonly options: DockerSandboxOptions) {}

  async run(input: RunInSandboxInput): Promise<RunInSandboxOutput> {
    const mountModeFlag = this.options.mountMode === 'read-write' ? 'rw' : 'ro';
    const networkMode = this.options.networkMode ?? 'none';
    const whitelist = this.options.networkWhitelist ?? [];

    const args: string[] = [
      'run',
      '--rm',
      '--init',
      '--workdir',
      '/workspace',
      '--volume',
      `${input.workspacePath}:/workspace:${mountModeFlag}`,
      '--network',
      networkMode,
    ];

    // If using whitelist with bridge network, need NET_ADMIN for iptables
    if (networkMode === 'bridge' && whitelist.length > 0) {
      args.push('--cap-add', 'NET_ADMIN');
    }

    if (this.options.cpus !== undefined) {
      args.push('--cpus', String(this.options.cpus));
    }

    if (this.options.memoryMb !== undefined) {
      args.push('--memory', `${this.options.memoryMb}m`);
    }

    for (const [key, value] of Object.entries(input.env ?? {})) {
      args.push('--env', `${key}=${value}`);
    }

    args.push(this.options.image);

    // Apply whitelist enforcement if network=bridge and whitelist is non-empty
    const effectiveCommand = (networkMode === 'bridge' && whitelist.length > 0)
      ? buildWhitelistEntrypoint(whitelist, input.command)
      : input.command;

    args.push(...effectiveCommand);

    return await new Promise<RunInSandboxOutput>((resolve, reject) => {
      const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });

      let stdout = '';
      let stderr = '';

      child.stdout.setEncoding('utf-8');
      child.stderr.setEncoding('utf-8');

      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });

      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });

      child.on('error', (error) => {
        reject(error);
      });

      const timeout =
        input.timeoutMs && input.timeoutMs > 0
          ? setTimeout(() => {
              child.kill('SIGKILL');
            }, input.timeoutMs)
          : undefined;

      child.on('close', (code) => {
        if (timeout) clearTimeout(timeout);
        resolve({ exitCode: code ?? 1, stdout, stderr });
      });
    });
  }
}
