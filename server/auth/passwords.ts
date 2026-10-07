/**
 * Password hashing for SignCraft AI.
 *
 * PBKDF2-SHA256 through WebCrypto, because that is the only strong KDF available in *both*
 * runtimes this project deploys to (Vercel Node functions and Cloudflare Pages Workers) with no
 * native dependency. Passwords are never stored, logged or compared in plaintext: a stored value
 * that is not a well-formed PBKDF2 hash is rejected outright.
 *
 * Stored format: `pbkdf2-sha256$<iterations>$<base64 salt>$<base64 hash>`
 */

const ALGORITHM_LABEL = 'pbkdf2-sha256';
const DIGEST = 'SHA-256';
const SALT_BYTES = 16;
const KEY_LENGTH_BITS = 256;

/** OWASP's current recommendation for PBKDF2-HMAC-SHA256. */
export const DEFAULT_ITERATIONS = 210_000;
/** Anything weaker than this is refused, even if it parses. */
export const MINIMUM_ITERATIONS = 100_000;
export const MAXIMUM_ITERATIONS = 1_000_000;
export const MINIMUM_PASSWORD_LENGTH = 10;
export const MAXIMUM_PASSWORD_LENGTH = 256;

export interface ParsedPasswordHash {
  iterations: number;
  salt: Uint8Array;
  hash: Uint8Array;
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytesFromBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

function subtleCrypto(): SubtleCrypto | null {
  const subtle = globalThis.crypto?.subtle;
  return subtle ?? null;
}

/** True only for a well-formed PBKDF2 hash produced by this module. */
export function isPasswordHash(value: unknown): value is string {
  return typeof value === 'string' && parsePasswordHash(value) !== null;
}

export function parsePasswordHash(value: string): ParsedPasswordHash | null {
  const parts = value.split('$');
  if (parts.length !== 4) return null;
  const [label, rawIterations, rawSalt, rawHash] = parts;
  if (label !== ALGORITHM_LABEL) return null;
  const iterations = Number(rawIterations);
  if (!Number.isInteger(iterations) || iterations < MINIMUM_ITERATIONS || iterations > MAXIMUM_ITERATIONS) return null;
  const salt = bytesFromBase64(rawSalt);
  const hash = bytesFromBase64(rawHash);
  if (!salt || !hash || salt.length !== SALT_BYTES || hash.length !== KEY_LENGTH_BITS / 8) return null;
  return { iterations, salt, hash };
}

/** Length-independent comparison: the loop always runs over both inputs. */
export function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array | null> {
  const subtle = subtleCrypto();
  if (!subtle) return null;
  try {
    const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', hash: DIGEST, salt: salt as BufferSource, iterations },
      key,
      KEY_LENGTH_BITS,
    );
    return new Uint8Array(bits);
  } catch {
    return null;
  }
}

export interface HashOptions {
  iterations?: number;
  salt?: Uint8Array;
}

/**
 * Produces the storable hash. Used by `npm run hash-password` when an operator provisions an
 * account; the password itself is read from stdin and never printed or stored.
 */
export async function hashPassword(password: string, options: HashOptions = {}): Promise<string> {
  if (typeof password !== 'string' || password.length < MINIMUM_PASSWORD_LENGTH || password.length > MAXIMUM_PASSWORD_LENGTH) {
    throw new Error(`A password must be between ${MINIMUM_PASSWORD_LENGTH} and ${MAXIMUM_PASSWORD_LENGTH} characters.`);
  }
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  if (!Number.isInteger(iterations) || iterations < MINIMUM_ITERATIONS || iterations > MAXIMUM_ITERATIONS) {
    throw new Error('Iteration count is outside the accepted range.');
  }
  const salt = options.salt ?? globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derive(password, salt, iterations);
  if (!derived) throw new Error('This runtime cannot derive password hashes (WebCrypto is unavailable).');
  return `${ALGORITHM_LABEL}$${iterations}$${base64FromBytes(salt)}$${base64FromBytes(derived)}`;
}

/**
 * Verifies a candidate password against a stored hash. Returns false — never throws — for a
 * malformed hash, a plaintext value, an unsupported runtime or a wrong password, so a
 * misconfigured deployment fails closed instead of letting anyone in.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (typeof password !== 'string' || password.length === 0 || password.length > MAXIMUM_PASSWORD_LENGTH) return false;
  const parsed = parsePasswordHash(typeof storedHash === 'string' ? storedHash : '');
  if (!parsed) return false;
  const derived = await derive(password, parsed.salt, parsed.iterations);
  if (!derived) return false;
  return timingSafeEqual(derived, parsed.hash);
}

/**
 * Runs the same work as a real verification so a missing account and a wrong password take a
 * similar amount of time and return the same response.
 */
export async function equalizeTiming(): Promise<void> {
  await verifyPassword('timing-equalization-placeholder', `${ALGORITHM_LABEL}$${MINIMUM_ITERATIONS}$${base64FromBytes(new Uint8Array(SALT_BYTES))}$${base64FromBytes(new Uint8Array(KEY_LENGTH_BITS / 8))}`);
}
