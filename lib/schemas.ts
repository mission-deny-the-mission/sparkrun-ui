import { z } from "zod";

export const RecipeListItemSchema = z.object({
  name: z.string(),
  file: z.string(),
  path: z.string(),
  model: z.string(),
  description: z.string().default(""),
  runtime: z.string(),
  min_nodes: z.number().int().nonnegative(),
  tp: z.union([z.number(), z.string()]).nullable().optional(),
  gpu_mem: z.union([z.number(), z.string()]).nullable().optional(),
  registry: z.string(),
  builder: z.string().optional(),
});
export type RecipeListItem = z.infer<typeof RecipeListItemSchema>;

export const RecipeListSchema = z.array(RecipeListItemSchema);

const WorkloadMetaSchema = z
  .object({
    cluster_id: z.string().optional(),
    effective_container_image: z.string().optional(),
    hosts: z.array(z.string()).optional(),
    model: z.string().optional(),
    overrides: z.record(z.string(), z.unknown()).default({}),
    port: z.number().int().optional(),
    recipe: z.string().optional(),
    recipe_state: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();

export const WorkloadSchema = z.object({
  cluster_id: z.string(),
  host: z.string().optional(),
  status: z.string().optional(),
  image: z.string().optional(),
  label: z.string().optional(),
  meta: WorkloadMetaSchema.default(() => ({ overrides: {} })),
});
export type Workload = z.infer<typeof WorkloadSchema>;

export const ClusterStatusSchema = z.object({
  groups: z.record(z.string(), z.unknown()).default({}),
  solo_entries: z.array(WorkloadSchema).default([]),
  idle_hosts: z.array(z.string()).default([]),
  pending_ops: z.array(z.unknown()).default([]),
  errors: z.record(z.string(), z.unknown()).default({}),
  total_containers: z.number().int().default(0),
  host_count: z.number().int().default(0),
});
export type ClusterStatus = z.infer<typeof ClusterStatusSchema>;

/**
 * Map sparkrun's status JSON into the workload list the UI renders.
 *
 * sparkrun reports multi-node clusters under `groups` (cluster_id ->
 * { meta, containers }) while `solo_entries` only carries non-grouped
 * containers. The dashboard and every workload lookup used to read
 * `solo_entries` alone, so 2-node runs were invisible. Merge both.
 */
export function collectWorkloads(status: ClusterStatus): Workload[] {
  const grouped: Workload[] = Object.entries(status.groups).map(([clusterId, raw]) => {
    const group = (raw ?? {}) as {
      meta?: Record<string, unknown>;
      containers?: Array<{
        host?: string;
        role?: string;
        status?: string;
        image?: string;
      }>;
    };
    const containers = group.containers ?? [];
    const meta = (group.meta ?? {}) as Record<string, unknown>;
    return {
      cluster_id: clusterId,
      meta: { ...meta, cluster_id: clusterId } as Workload["meta"],
      host:
        containers
          .map((c) => c.host)
          .filter(Boolean)
          .join(", ") || undefined,
      status: containers[0]?.status,
      image: containers[0]?.image,
      label:
        containers
          .map((c) => c.role)
          .filter(Boolean)
          .join(", ") || undefined,
    };
  });
  return [...grouped, ...status.solo_entries];
}

export function findWorkload(status: ClusterStatus, clusterId: string): Workload | undefined {
  return collectWorkloads(status).find((w) => w.cluster_id === clusterId);
}

export const RecipeValidateResultSchema = z.object({
  recipe: z.string().optional(),
  valid: z.boolean(),
  issues: z
    .array(
      z.union([
        z.string(),
        z.object({
          message: z.string(),
          path: z.string().optional(),
          severity: z.enum(["error", "warning"]).optional(),
        }),
      ]),
    )
    .default([]),
});
export type RecipeValidateResult = z.infer<typeof RecipeValidateResultSchema>;

export const MonitorTickSchema = z
  .object({
    host: z.string(),
    ts: z.string().optional(),
    cpu_pct: z.number().optional(),
    ram_used_gb: z.number().optional(),
    ram_total_gb: z.number().optional(),
    gpu_pct: z.number().optional(),
    gpu_mem_used_gb: z.number().optional(),
    gpu_mem_total_gb: z.number().optional(),
  })
  .loose();
export type MonitorTick = z.infer<typeof MonitorTickSchema>;

export const ClusterEntrySchema = z.object({
  name: z.string(),
  hosts: z.array(z.string()).default([]),
  description: z.string().optional(),
  is_default: z.boolean().default(false),
});
export type ClusterEntry = z.infer<typeof ClusterEntrySchema>;

export const ValidationIssueSchema = z.object({
  severity: z.enum(["error", "warning"]),
  message: z.string(),
  field: z.string().optional(),
  line: z.number().int().optional(),
  conflictingClusterId: z.string().optional(),
  conflictingRecipe: z.string().optional(),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;
