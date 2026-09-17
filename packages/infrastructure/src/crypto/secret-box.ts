import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { SecretBox } from '@corebiz/application';

/**
 * AES-256-GCM for provider keys at rest.
 *
 * GCM and not CBC because it authenticates: a ciphertext edited in the database fails to
 * open instead of decrypting into garbage that then gets sent to a provider as a key.
 *
 * The tenant id goes in as additional authenticated data. It is not secret, but it binds
 * each sealed key to its company, so copying one company's `api_key_ciphertext` into
 * another's row — with a stray UPDATE or a restore gone wrong — yields nothing usable.
 *
 * Format: `v1.<iv>.<tag>.<ciphertext>`, base64url. The version prefix is there so rotating
 * the algorithm or the key later does not require guessing what an old value is.
 */

const VERSION = 'v1';
const IV_BYTES = 12;

/**
 * Builds the box from `AI_KEY_ENCRYPTION_KEY`: 32 random bytes, base64.
 *
 * Without the variable the box still exists but reports `available: false`, and the use
 * case refuses to store a key. Refusing is the right failure: storing it in clear "until
 * the variable is set" is how keys end up in backups forever.
 */
export function aesGcmSecretBox(base64Key: string | undefined): SecretBox {
  const key = base64Key === undefined || base64Key === '' ? null : Buffer.from(base64Key, 'base64');
  if (key !== null && key.length !== 32) {
    throw new Error('AI_KEY_ENCRYPTION_KEY must be 32 bytes encoded in base64.');
  }

  return {
    available: key !== null,

    seal(plaintext, context) {
      if (key === null) throw new Error('AI_KEY_ENCRYPTION_KEY is not configured.');
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(context, 'utf8'));
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return [
        VERSION,
        iv.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
        ciphertext.toString('base64url'),
      ].join('.');
    },

    open(sealed, context) {
      if (key === null) return null;
      const [version, iv, tag, ciphertext] = sealed.split('.');
      if (
        version !== VERSION ||
        iv === undefined ||
        tag === undefined ||
        ciphertext === undefined
      ) {
        return null;
      }
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
        decipher.setAAD(Buffer.from(context, 'utf8'));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([
          decipher.update(Buffer.from(ciphertext, 'base64url')),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        // Wrong key, wrong tenant or tampered value: all mean the same to the caller.
        return null;
      }
    },
  };
}
