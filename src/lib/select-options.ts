export type SearchOption = { value: string; label: string; detail?: string; available?: boolean };

const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
const compact = (value: string) => value.replace(/[^\p{L}\p{N}]/gu, "");

export function filterSelectOptions(options: SearchOption[], query: string) {
  const search = normalize(query.trim());
  if (!search) return options;
  const code = compact(search);
  return options.filter(option => {
    const text = normalize(`${option.label} ${option.detail ?? ""}`);
    return text.includes(search) || !!code && compact(text).includes(code);
  });
}

export function nextSelectOption(active: number, count: number, direction: number) {
  if (!count) return -1;
  return active < 0 || active >= count ? direction > 0 ? 0 : count - 1 : (active + direction + count) % count;
}
