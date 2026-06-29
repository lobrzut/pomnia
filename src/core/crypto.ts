/**
 * Vault cryptography. Zero native dependencies — Node's built-in `crypto` only.
 *
 *   KDF   : scrypt (N=2^17, r=8, p=1) → 32-byte key
 *   Cipher: AES-256-GCM, fresh 12-byte IV per blob, 16-byte auth tag
 *
 * Each encrypted blob is laid out as:
 *   [ magic "CVB1" (4) | iv (12) | tag (16) | ciphertext (…) ]
 *
 * The KDF salt lives in the vault header (see vault.ts), not in each blob, so the
 * derived key is computed once at unlock and reused for the whole session.
 */
import crypto from 'node:crypto'

const MAGIC = Buffer.from('CVB1', 'ascii')
const IV_LEN = 12
const TAG_LEN = 16
const KEY_LEN = 32
export const SALT_LEN = 16

export interface ScryptParams {
  N: number
  r: number
  p: number
}

export const DEFAULT_SCRYPT: ScryptParams = { N: 1 << 17, r: 8, p: 1 }

export function newSalt(): Buffer {
  return crypto.randomBytes(SALT_LEN)
}

export function deriveKey(
  passphrase: string,
  salt: Buffer,
  params: ScryptParams = DEFAULT_SCRYPT
): Buffer {
  // maxmem must be generous for N=2^17 (≈128*N*r ≈ 128MB).
  return crypto.scryptSync(passphrase.normalize('NFKC'), salt, KEY_LEN, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: 256 * 1024 * 1024
  })
}

export function encrypt(key: Buffer, plaintext: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([MAGIC, iv, tag, enc])
}

export function decrypt(key: Buffer, blob: Buffer): Buffer {
  if (blob.length < MAGIC.length + IV_LEN + TAG_LEN)
    throw new Error('ciphertext too short / corrupt')
  if (!blob.subarray(0, MAGIC.length).equals(MAGIC))
    throw new Error('bad magic — not a Reliqua blob')
  let off = MAGIC.length
  const iv = blob.subarray(off, (off += IV_LEN))
  const tag = blob.subarray(off, (off += TAG_LEN))
  const enc = blob.subarray(off)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(enc), decipher.final()])
  } catch {
    throw new Error('decryption failed — wrong passphrase or corrupted blob')
  }
}

export function encryptJSON(key: Buffer, value: unknown): Buffer {
  return encrypt(key, Buffer.from(JSON.stringify(value), 'utf8'))
}

export function decryptJSON<T>(key: Buffer, blob: Buffer): T {
  return JSON.parse(decrypt(key, blob).toString('utf8')) as T
}

export function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

/** Verify a passphrase against a stored check blob (encrypts a known constant). */
export const CHECK_PLAINTEXT = Buffer.from('continuum-vault-check-v1', 'utf8')
