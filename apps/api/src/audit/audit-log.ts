import type { PoolClient } from 'pg';

export type AuditLogEntryInput = {
  tenantId: string;
  userId?: string | null;
  projectId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeAuditLog(client: PoolClient, entry: AuditLogEntryInput) {
  const metadata = entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};

  await client.query(
    `INSERT INTO audit_logs (tenant_id, user_id, project_id, action, resource_type, resource_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      entry.tenantId,
      entry.userId ?? null,
      entry.projectId ?? null,
      entry.action,
      entry.resourceType,
      entry.resourceId ?? null,
      JSON.stringify(metadata),
    ],
  );
}
