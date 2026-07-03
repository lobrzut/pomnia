/**
 * Vector ↔ blob conversion for sqlite-vec storage.
 *
 * Python: `struct.pack(f"{len(vec)}f", *vec)` — packs floats as native-endian
 * `float` (4 bytes each). On the target hosts (Linux x86_64 for the master,
 * Windows x86_64 for Reliqua Electron on user desktops), "native" is
 * little-endian and the format is IEEE 754 single-precision. sqlite-vec's
 * blob wire format expects exactly that.
 *
 * We use Buffer + writeFloatLE (explicit little-endian) to be portable across
 * platforms, matching what Python `struct.pack("f", …)` produces on the
 * platforms we care about.
 */

/** Pack a float32 vector into a raw sqlite-vec blob. */
export function vecToBlob(vec: number[]): Buffer {
  const buf = Buffer.allocUnsafe(vec.length * 4)
  for (let i = 0; i < vec.length; i++) {
    buf.writeFloatLE(vec[i]!, i * 4)
  }
  return buf
}

/** Unpack a sqlite-vec blob back into a float32 vector. */
export function blobToVec(blob: Buffer): number[] {
  const n = blob.length / 4
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    out[i] = blob.readFloatLE(i * 4)
  }
  return out
}
