import { sha256 } from '@noble/hashes/sha2.js';
import type { AIConceptResult, SignConfiguration, UploadedStorefrontPhoto } from './sign.js';

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}
export function fingerprint(value: unknown): string {
  return Array.from(sha256(new TextEncoder().encode(canonicalJson(value))), (b) => b.toString(16).padStart(2, '0')).join('');
}
export function photoIdentity(photo: UploadedStorefrontPhoto | null): string {
  return photo?.sourceIdentity ?? (photo ? `${photo.fileName}:${photo.sizeBytes}:${photo.mimeType}` : 'no-photo');
}
export function conceptMatches(concept: AIConceptResult | null, configuration: SignConfiguration, sourceIdentity: string): boolean {
  return !!concept?.provenance && concept.provenance.sourceIdentity === sourceIdentity && canonicalJson(concept.provenance.configuration) === canonicalJson(configuration);
}
export function makeProvenance(configuration: SignConfiguration, sourceIdentity: string) {
  const snapshot = JSON.parse(JSON.stringify(configuration)) as SignConfiguration;
  return { schemaVersion: 1 as const, fingerprint: fingerprint({ configuration: snapshot, sourceIdentity }), sourceIdentity, configuration: snapshot };
}
