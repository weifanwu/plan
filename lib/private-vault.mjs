const VAULT_VERSION = 1;
const DEFAULT_ITERATIONS = 250_000;
const AAD = new TextEncoder().encode("MAP_PRIVATE_VAULT_V1");

function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveVaultKey(passphrase, salt, iterations = DEFAULT_ITERATIONS) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function sealPrivateVault(items, key, salt, iterations = DEFAULT_ITERATIONS) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(items));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD }, key, plaintext);
  return {
    version: VAULT_VERSION,
    kdf: "PBKDF2-SHA-256",
    iterations,
    salt: typeof salt === "string" ? salt : bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function createPrivateVault(passphrase, items = []) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveVaultKey(passphrase, saltBytes);
  const salt = bytesToBase64(saltBytes);
  const envelope = await sealPrivateVault(items, key, salt);
  return { key, salt, items, iterations: DEFAULT_ITERATIONS, envelope };
}

export async function unlockPrivateVault(passphrase, envelope) {
  if (!envelope || envelope.version !== VAULT_VERSION || envelope.kdf !== "PBKDF2-SHA-256") throw new Error("INVALID_VAULT");
  const iterations = Number(envelope.iterations);
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) throw new Error("INVALID_VAULT");
  try {
    const saltBytes = base64ToBytes(envelope.salt);
    const key = await deriveVaultKey(passphrase, saltBytes, iterations);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(envelope.iv), additionalData: AAD },
      key,
      base64ToBytes(envelope.ciphertext),
    );
    const items = JSON.parse(new TextDecoder().decode(plaintext));
    if (!Array.isArray(items)) throw new Error("INVALID_VAULT");
    return { key, salt: envelope.salt, items, iterations };
  } catch {
    throw new Error("UNLOCK_FAILED");
  }
}

export const PRIVATE_VAULT_ITERATIONS = DEFAULT_ITERATIONS;
