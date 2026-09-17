import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { aesGcmSecretBox } from './secret-box';

const KEY = randomBytes(32).toString('base64');
const TENANT = '0190a8f0-0000-7000-8000-000000000001';

describe('aesGcmSecretBox', () => {
  it('round-trips and never contains the plaintext', () => {
    const box = aesGcmSecretBox(KEY);
    const sealed = box.seal('sk-ant-secret', TENANT);

    expect(sealed.startsWith('v1.')).toBe(true);
    expect(sealed).not.toContain('sk-ant-secret');
    expect(box.open(sealed, TENANT)).toBe('sk-ant-secret');
  });

  it('uses a fresh IV every time', () => {
    const box = aesGcmSecretBox(KEY);
    expect(box.seal('same', TENANT)).not.toBe(box.seal('same', TENANT));
  });

  it('does not open for another company', () => {
    const box = aesGcmSecretBox(KEY);
    expect(box.open(box.seal('sk', TENANT), 'another-tenant')).toBeNull();
  });

  it('does not open a tampered value or one sealed with another key', () => {
    const box = aesGcmSecretBox(KEY);
    const sealed = box.seal('sk', TENANT);
    const parts = sealed.split('.');
    const flipped = parts[3]!.startsWith('A') ? `B${parts[3]!.slice(1)}` : `A${parts[3]!.slice(1)}`;

    expect(box.open([parts[0], parts[1], parts[2], flipped].join('.'), TENANT)).toBeNull();
    expect(aesGcmSecretBox(randomBytes(32).toString('base64')).open(sealed, TENANT)).toBeNull();
    expect(box.open('garbage', TENANT)).toBeNull();
  });

  it('reports itself unavailable without a key, and rejects a key of the wrong size', () => {
    expect(aesGcmSecretBox(undefined).available).toBe(false);
    expect(aesGcmSecretBox(undefined).open('v1.a.b.c', TENANT)).toBeNull();
    expect(() => aesGcmSecretBox(randomBytes(16).toString('base64'))).toThrow();
  });
});
