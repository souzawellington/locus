import type { StrokeTier } from "../idea/schema.ts";

/** Widths sit inside the anatomy tiers: silhouette 1.75–2.25, crease 1–1.25, section 0.85, construction 0.6. */
export function strokePx(tier: StrokeTier): number {
  if (tier === "silhouette") return 2;
  if (tier === "crease") return 1.125;
  if (tier === "section") return 0.85;
  return 0.6;
}
