export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export const serializeDecimal = (value: { toNumber(): number } | number): number =>
  typeof value === 'number' ? value : value.toNumber();
