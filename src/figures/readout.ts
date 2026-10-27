export type ReadoutLine = { label: string; value: string; role: string };

/** Text written on the first render. Never empty, and not deferred to an effect. */
export function openingReadout(readouts: ReadoutLine[]): string {
  if (!readouts.length) return "0%";
  return readouts.map((item) => `${item.label} ${item.value}`).join(" · ");
}
