import { os, eventIterator } from "@orpc/server";
import { z } from "zod";
import { streamSparkrunNdjson } from "@/lib/sparkrun";

const HostMetricsSchema = z
  .object({
    hostname: z.string().optional(),
    uptime_sec: z.string().optional(),
    cpu_usage_pct: z.string().optional(),
    cpu_temp_c: z.string().optional(),
    cpu_load_1m: z.string().optional(),
    mem_total_mb: z.string().optional(),
    mem_used_mb: z.string().optional(),
    mem_used_pct: z.string().optional(),
    gpu_name: z.string().optional(),
    gpu_util_pct: z.string().optional(),
    gpu_mem_used_mb: z.string().optional(),
    gpu_mem_total_mb: z.string().optional(),
    gpu_temp_c: z.string().optional(),
    gpu_power_w: z.string().optional(),
    gpu_power_limit_w: z.string().optional(),
    sparkrun_jobs: z.string().optional(),
    sparkrun_job_names: z.string().optional(),
  })
  .loose();

const TickSchema = z.object({
  timestamp: z.number(),
  hosts: z.record(z.string(), HostMetricsSchema),
});

/**
 * sparkrun 0.3.x streams monitor ticks with `hosts` as an ARRAY of
 * { host, error, sample, workloads, used_slots, free_slots }. The UI
 * consumers (AggregateStats, MonitorLive) expect the older record shape
 * hostname -> metrics. Normalize so both views work against either shape.
 */
function normalizeMonitorTick(raw: unknown): unknown {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const hosts = obj.hosts;
  if (!Array.isArray(hosts)) return obj;
  const record: Record<string, unknown> = {};
  for (const entry of hosts as Array<Record<string, unknown>>) {
    const sample = entry.sample as Record<string, unknown> | undefined;
    if (!sample) continue;
    const key =
      (typeof sample.hostname === "string" && sample.hostname) ||
      (typeof entry.host === "string" && entry.host) ||
      `host-${Object.keys(record).length}`;
    record[key] = sample;
  }
  return { ...obj, hosts: record };
}

export const stream = os
  .input(
    z
      .object({
        cluster: z.string().optional(),
        hosts: z.array(z.string()).optional(),
        intervalSec: z.number().int().min(1).max(30).default(2),
      })
      .optional(),
  )
  .output(eventIterator(TickSchema))
  .handler(async function* ({ input, signal }) {
    const args = ["cluster", "monitor", "--json", "--interval", String(input?.intervalSec ?? 2)];
    if (input?.cluster) args.push("--cluster", input.cluster);
    else if (input?.hosts?.length) args.push("--hosts", input.hosts.join(","));
    for await (const obj of streamSparkrunNdjson<z.infer<typeof TickSchema>>(args, { signal })) {
      if (signal?.aborted) break;
      yield normalizeMonitorTick(obj) as z.infer<typeof TickSchema>;
    }
  });
