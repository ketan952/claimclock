// Minimal WebAuthn (passkey) verification for the Worker: no attestation trust chain is
// evaluated (equivalent to attestation "none"), because the account only needs the
// authenticator's public key. Supports ES256 (-7) and RS256 (-257), the two algorithms
// every current platform authenticator offers. Inputs are strictly bounded before parsing.
import { InputError } from './security.ts';

export const CLIENT_DATA_LIMIT = 4096;
export const ATTESTATION_LIMIT = 8192;
export const AUTH_DATA_LIMIT = 4096;
export const SIGNATURE_LIMIT = 1024;
export const CREDENTIAL_ID_LIMIT = 1023;
export const CHALLENGE_TTL_SECONDS = 300;
export const SUPPORTED_ALGORITHMS = [-7, -257] as const;
export type Algorithm = typeof SUPPORTED_ALGORITHMS[number];

export function toBase64url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/** Accepts only the canonical unpadded form, bounded before any allocation. */
export function fromBase64url(value: unknown, maxBytes: number, minBytes = 1): Uint8Array {
  if (typeof value !== 'string' || value.length > Math.ceil(maxBytes * 4 / 3) || value.length % 4 === 1 || !/^[A-Za-z0-9_-]*$/.test(value)) throw new InputError();
  let binary: string;
  try { binary = atob(value.replace(/-/g, '+').replace(/_/g, '/')); } catch { throw new InputError(); }
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  if (bytes.length < minBytes || bytes.length > maxBytes || toBase64url(bytes) !== value) throw new InputError();
  return bytes;
}
export function randomBase64url(bytes = 32): string { return toBase64url(crypto.getRandomValues(new Uint8Array(bytes))); }
async function sha256Bytes(bytes: Uint8Array): Promise<Uint8Array> { return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)); }
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// --- CBOR (RFC 8949) definite-length subset used by WebAuthn and COSE keys. ---
export type CborValue = number | string | Uint8Array | CborValue[] | Map<number | string, CborValue>;
class CborReader {
  offset = 0; items = 0;
  private bytes: Uint8Array;
  constructor(bytes: Uint8Array) { this.bytes = bytes; }
  private byte(): number { if (this.offset >= this.bytes.length) throw new InputError(); return this.bytes[this.offset++]; }
  private argument(info: number): number {
    if (info < 24) return info;
    const size = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : 0;
    if (!size) throw new InputError(); // Reserved or indefinite lengths are not accepted.
    let value = 0;
    for (let i = 0; i < size; i++) value = value * 256 + this.byte();
    if (!Number.isSafeInteger(value)) throw new InputError();
    return value;
  }
  private take(length: number): Uint8Array {
    if (length > this.bytes.length - this.offset) throw new InputError();
    const slice = this.bytes.slice(this.offset, this.offset + length); this.offset += length; return slice;
  }
  read(depth = 0): CborValue {
    if (depth > 8 || ++this.items > 512) throw new InputError();
    const head = this.byte(), major = head >> 5, info = head & 31;
    switch (major) {
      case 0: return this.argument(info);
      case 1: return -1 - this.argument(info);
      case 2: return this.take(this.argument(info));
      case 3: { const text = this.take(this.argument(info)); try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(text); } catch { throw new InputError(); } }
      case 4: { const length = this.argument(info); if (length > 64) throw new InputError(); const array: CborValue[] = []; for (let i = 0; i < length; i++) array.push(this.read(depth + 1)); return array; }
      case 5: {
        const length = this.argument(info); if (length > 64) throw new InputError();
        const map = new Map<number | string, CborValue>();
        for (let i = 0; i < length; i++) {
          const key = this.read(depth + 1);
          if ((typeof key !== 'number' && typeof key !== 'string') || map.has(key)) throw new InputError();
          map.set(key, this.read(depth + 1));
        }
        return map;
      }
      default: throw new InputError(); // Tags, floats and simple values do not occur in the structures we accept.
    }
  }
}
/** Decodes one CBOR item and reports how many bytes it occupied. */
export function decodeCbor(bytes: Uint8Array): { value: CborValue; length: number } {
  const reader = new CborReader(bytes);
  const value = reader.read();
  return { value, length: reader.offset };
}

// --- COSE key handling. ---
export type CoseKey = { algorithm: Algorithm; jwk: JsonWebKey };
function bytesEntry(map: Map<number | string, CborValue>, key: number, min: number, max: number): Uint8Array {
  const value = map.get(key);
  if (!(value instanceof Uint8Array) || value.length < min || value.length > max) throw new InputError();
  return value;
}
export function parseCoseKey(bytes: Uint8Array): CoseKey {
  const { value } = decodeCbor(bytes);
  if (!(value instanceof Map)) throw new InputError();
  const kty = value.get(1), alg = value.get(3);
  if (kty === 2 && alg === -7) {
    if (value.get(-1) !== 1) throw new InputError(); // P-256 only.
    const x = bytesEntry(value, -2, 32, 32), y = bytesEntry(value, -3, 32, 32);
    return { algorithm: -7, jwk: { kty: 'EC', crv: 'P-256', x: toBase64url(x), y: toBase64url(y) } };
  }
  if (kty === 3 && alg === -257) {
    const n = bytesEntry(value, -1, 256, 512), e = bytesEntry(value, -2, 1, 8);
    return { algorithm: -257, jwk: { kty: 'RSA', n: toBase64url(n), e: toBase64url(e) } };
  }
  throw new InputError();
}
async function importKey(key: CoseKey): Promise<CryptoKey> {
  try {
    return key.algorithm === -7
      ? await crypto.subtle.importKey('jwk', key.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
      : await crypto.subtle.importKey('jwk', key.jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  } catch { throw new InputError(); }
}
/** WebAuthn ECDSA signatures are DER sequences; WebCrypto verifies the raw 64-byte r||s form. */
export function derToRaw(der: Uint8Array): Uint8Array {
  // A P-256 signature is at most 72 bytes, so the sequence length is always short-form.
  if (der.length < 8 || der.length > 72 || der[0] !== 0x30 || der[1] & 0x80 || der[1] !== der.length - 2) throw new InputError();
  let offset = 2;
  const integer = (): Uint8Array => {
    if (der[offset++] !== 0x02) throw new InputError();
    const length = der[offset++];
    if (length < 1 || length > 33 || offset + length > der.length) throw new InputError();
    let start = offset; const end = offset + length; offset = end;
    while (start < end - 1 && der[start] === 0) start++;
    if (end - start > 32) throw new InputError();
    const out = new Uint8Array(32); out.set(der.slice(start, end), 32 - (end - start)); return out;
  };
  const r = integer(), s = integer();
  if (offset !== der.length) throw new InputError();
  const raw = new Uint8Array(64); raw.set(r); raw.set(s, 32); return raw;
}

// --- Authenticator data. ---
export type AuthenticatorData = {
  rpIdHash: Uint8Array; userPresent: boolean; userVerified: boolean; backupEligible: boolean; backedUp: boolean; signCount: number;
  credential?: { id: Uint8Array; publicKey: Uint8Array; key: CoseKey };
};
export function parseAuthenticatorData(bytes: Uint8Array): AuthenticatorData {
  if (bytes.length < 37 || bytes.length > AUTH_DATA_LIMIT) throw new InputError();
  const flags = bytes[32];
  const result: AuthenticatorData = {
    rpIdHash: bytes.slice(0, 32), userPresent: Boolean(flags & 1), userVerified: Boolean(flags & 4), backupEligible: Boolean(flags & 8), backedUp: Boolean(flags & 16),
    signCount: new DataView(bytes.buffer, bytes.byteOffset + 33, 4).getUint32(0),
  };
  let offset = 37;
  if (flags & 64) {
    if (bytes.length < offset + 18) throw new InputError();
    offset += 16; // AAGUID is not used: no attestation trust decisions are made.
    const idLength = (bytes[offset] << 8) | bytes[offset + 1]; offset += 2;
    if (idLength < 16 || idLength > CREDENTIAL_ID_LIMIT || bytes.length < offset + idLength) throw new InputError();
    const id = bytes.slice(offset, offset + idLength); offset += idLength;
    const keyBytes = bytes.slice(offset);
    const { length } = decodeCbor(keyBytes);
    const publicKey = keyBytes.slice(0, length); offset += length;
    result.credential = { id, publicKey, key: parseCoseKey(publicKey) };
  }
  if (flags & 128) { const { length } = decodeCbor(bytes.slice(offset)); offset += length; }
  if (offset !== bytes.length) throw new InputError();
  return result;
}

type ClientData = { type: string; challenge: string; origin: string };
function parseClientData(bytes: Uint8Array, expectedType: string, expectedChallenge: string, expectedOrigin: string): ClientData {
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)); } catch { throw new InputError(); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new InputError();
  const data = parsed as Record<string, unknown>;
  if (data.type !== expectedType || typeof data.challenge !== 'string' || typeof data.origin !== 'string') throw new InputError();
  // Constant-time comparison is unnecessary for a single-use random challenge, but equality must be exact.
  if (data.challenge !== expectedChallenge || data.origin !== expectedOrigin) throw new InputError();
  if (data.crossOrigin === true) throw new InputError();
  return { type: data.type, challenge: data.challenge, origin: data.origin };
}

export type RegistrationInput = { clientDataJSON: unknown; attestationObject: unknown; transports?: unknown };
export type RegisteredCredential = { credentialId: string; publicKey: string; algorithm: Algorithm; signCount: number; transports: string | null; backupEligible: boolean };
export async function verifyRegistration(input: RegistrationInput, expected: { challenge: string; origin: string; rpId: string }): Promise<RegisteredCredential> {
  const clientData = fromBase64url(input.clientDataJSON, CLIENT_DATA_LIMIT, 2);
  parseClientData(clientData, 'webauthn.create', expected.challenge, expected.origin);
  const { value: attestation } = decodeCbor(fromBase64url(input.attestationObject, ATTESTATION_LIMIT, 8));
  if (!(attestation instanceof Map) || typeof attestation.get('fmt') !== 'string' || !(attestation.get('attStmt') instanceof Map)) throw new InputError();
  const authDataBytes = attestation.get('authData');
  if (!(authDataBytes instanceof Uint8Array)) throw new InputError();
  const authData = parseAuthenticatorData(authDataBytes);
  if (!equalBytes(authData.rpIdHash, await sha256Bytes(new TextEncoder().encode(expected.rpId))) || !authData.userPresent || !authData.userVerified || !authData.credential) throw new InputError();
  await importKey(authData.credential.key); // The key must be importable before it is stored.
  let transports: string | null = null;
  if (input.transports !== undefined) {
    if (!Array.isArray(input.transports) || input.transports.length > 8 || input.transports.some(t => typeof t !== 'string' || !/^[a-z-]{1,20}$/.test(t))) throw new InputError();
    transports = JSON.stringify(input.transports);
  }
  return { credentialId: toBase64url(authData.credential.id), publicKey: toBase64url(authData.credential.publicKey), algorithm: authData.credential.key.algorithm, signCount: authData.signCount, transports, backupEligible: authData.backupEligible };
}

export type AssertionInput = { clientDataJSON: unknown; authenticatorData: unknown; signature: unknown };
export type StoredCredential = { publicKey: string; algorithm: Algorithm; signCount: number };
/** Returns the new signature counter; throws InputError on any mismatch. */
export async function verifyAssertion(input: AssertionInput, stored: StoredCredential, expected: { challenge: string; origin: string; rpId: string }): Promise<{ signCount: number }> {
  const clientData = fromBase64url(input.clientDataJSON, CLIENT_DATA_LIMIT, 2);
  parseClientData(clientData, 'webauthn.get', expected.challenge, expected.origin);
  const authDataBytes = fromBase64url(input.authenticatorData, AUTH_DATA_LIMIT, 37);
  const authData = parseAuthenticatorData(authDataBytes);
  if (!equalBytes(authData.rpIdHash, await sha256Bytes(new TextEncoder().encode(expected.rpId))) || !authData.userPresent || !authData.userVerified) throw new InputError();
  // A counter that moves must move forward; authenticators without counters report zero.
  if ((authData.signCount !== 0 || stored.signCount !== 0) && authData.signCount <= stored.signCount) throw new InputError();
  const key = parseCoseKey(fromBase64url(stored.publicKey, 2048, 20));
  if (key.algorithm !== stored.algorithm) throw new InputError();
  const signatureBytes = fromBase64url(input.signature, SIGNATURE_LIMIT, 8);
  const signature = key.algorithm === -7 ? derToRaw(signatureBytes) : signatureBytes;
  const signed = new Uint8Array(authDataBytes.length + 32);
  signed.set(authDataBytes); signed.set(await sha256Bytes(clientData), authDataBytes.length);
  let valid = false;
  try {
    valid = await crypto.subtle.verify(key.algorithm === -7 ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5' }, await importKey(key), signature, signed);
  } catch { valid = false; }
  if (!valid) throw new InputError();
  return { signCount: authData.signCount };
}
