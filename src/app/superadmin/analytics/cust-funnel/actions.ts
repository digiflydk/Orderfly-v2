
"use server";

export async function getFunnelSummary() {
  // TODO: real implementation; return stable shape to unblock build
  return { total: 0, steps: [] as Array<{ name: string; count: number }> };
}
