/**
 * Fast hash function for creating cache keys from field configurations
 * Uses FNV-1a algorithm for speed and good distribution
 */

export function hashFields(fields: any[]): string {
  if (!fields || fields.length === 0) {
    return 'empty';
  }

  const str = JSON.stringify(
    fields.map((f) => ({ id: f.id, name: f.name, type: f.type })),
  );

  let hash = 2166136261;

  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return (hash >>> 0).toString(36);
}
