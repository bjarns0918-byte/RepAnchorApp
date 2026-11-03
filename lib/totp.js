// Time-based One-Time Password (TOTP) implementation, per RFC 6238 - the
// same standard Google Authenticator, Authy, and 1Password all use. Built on
// Node's built-in crypto module so there's no new dependency to install or
// trust - just well-defined, verifiable math.

import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const CODE_DIGITS = 6;

function base32Encode(buffer) {
  let bits = "";
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, "0");
  }
  let output = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  // Handle any leftover bits (pad with zeros to make a final 5-bit group)
  const remainder = bits.length % 5;
  if (remainder !== 0) {
    const lastChunk = bits.slice(bits.length - remainder).padEnd(5, "0");
    output += BASE32_ALPHABET[parseInt(lastChunk, 2)];
  }
  return output;
}

function base32Decode(base32String) {
  const clean = base32String.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

// Generates a new random secret, base32-encoded (the format authenticator
// apps expect you to scan or type in).
export function generateTotpSecret() {
  const randomBytes = crypto.randomBytes(20); // 160 bits, the standard size
  return base32Encode(randomBytes);
}

function computeTotpCode(base32Secret, forCounter) {
  const key = base32Decode(base32Secret);
  const counterBuffer = Buffer.alloc(8);
  // 8-byte big-endian counter, per RFC 4226. Split across two 32-bit writes
  // since Node's writeBigUInt64BE requires a BigInt - this avoids that ask
  // and works identically for realistic counter sizes.
  counterBuffer.writeUInt32BE(Math.floor(forCounter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(forCounter % 0x100000000, 4);

  const hmac = crypto.createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const code = binary % Math.pow(10, CODE_DIGITS);
  return code.toString().padStart(CODE_DIGITS, "0");
}

// Verifies a 6-digit code against the current time step, allowing 1 step
// (30 seconds) of drift in either direction - accounts for clock skew
// between the server and the person's phone without being too lenient.
export function verifyTotpCode(base32Secret, token, windowSteps = 1) {
  if (!token || !/^\d{6}$/.test(token)) return false;
  const currentCounter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (let errorWindow = -windowSteps; errorWindow <= windowSteps; errorWindow++) {
    const expected = computeTotpCode(base32Secret, currentCounter + errorWindow);
    if (expected === token) return true;
  }
  return false;
}

// Builds the otpauth:// URI that authenticator apps read when scanning a QR
// code - encodes the secret, account name, and issuer (shown as the entry's
// label inside the app).
export function buildOtpauthUri(base32Secret, accountEmail, issuer = "RepAnchor") {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({
    secret: base32Secret,
    issuer,
    algorithm: "SHA1",
    digits: String(CODE_DIGITS),
    period: String(STEP_SECONDS)
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
