import { describe, expect, it } from 'vitest';
import { checkBaseUrl, isPrivateAddress, isPrivateHost, type UrlParts } from './base-url';
import { AI_PROVIDERS, apiKeyHint, effectiveBaseUrl, isAiProvider } from './provider';

/** The domain has no `URL`; these are the parts WHATWG parsing would produce. */
const parts = (protocol: string, hostname: string, username = '', password = ''): UrlParts => ({
  protocol,
  hostname,
  username,
  password,
});

describe('checkBaseUrl — production', () => {
  it.each([
    parts('http:', 'ollama.example.com'),
    parts('https:', 'localhost'),
    parts('https:', '127.0.0.1'),
    parts('https:', '10.0.0.5'),
    parts('https:', '172.20.1.1'),
    parts('https:', '192.168.1.10'),
    parts('https:', '169.254.169.254'),
    parts('https:', '[::1]'),
    parts('https:', '[::ffff:a00:1]'),
    parts('https:', 'db'),
    parts('https:', 'printer.local'),
    parts('https:', 'api.example.com', 'user', 'pass'),
    parts('ftp:', 'api.example.com'),
  ])('rejects %o', (url) => {
    expect(checkBaseUrl(url, false).ok).toBe(false);
  });

  it.each([
    parts('https:', 'api.openai.com'),
    parts('https:', 'openrouter.ai'),
    parts('https:', '8.8.8.8'),
  ])('accepts %o', (url) => {
    expect(checkBaseUrl(url, false).ok).toBe(true);
  });
});

describe('checkBaseUrl — development switch', () => {
  it('lets a local Ollama through', () => {
    expect(checkBaseUrl(parts('http:', 'localhost'), true).ok).toBe(true);
  });

  it('still rejects schemes that are not http, and credentials', () => {
    expect(checkBaseUrl(parts('file:', ''), true).ok).toBe(false);
    expect(checkBaseUrl(parts('http:', 'localhost', 'a', 'b'), true).ok).toBe(false);
  });
});

describe('private hosts and addresses', () => {
  it('does not flag public names', () => {
    expect(isPrivateHost('api.anthropic.com')).toBe(false);
    expect(isPrivateHost('ai.internal')).toBe(true);
  });

  it('flags resolved private addresses of both families', () => {
    expect(isPrivateAddress('10.1.2.3')).toBe(true);
    expect(isPrivateAddress('100.64.0.1')).toBe(true);
    expect(isPrivateAddress('224.0.0.1')).toBe(true);
    expect(isPrivateAddress('fd00::1')).toBe(true);
    expect(isPrivateAddress('fe80::1')).toBe(true);
    expect(isPrivateAddress('::ffff:192.168.0.1')).toBe(true);
    expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false);
    expect(isPrivateAddress('142.250.1.1')).toBe(false);
    expect(isPrivateAddress('2607:f8b0::1')).toBe(false);
  });
});

describe('providers', () => {
  it('recognises exactly the declared providers', () => {
    for (const provider of AI_PROVIDERS) expect(isAiProvider(provider)).toBe(true);
    expect(isAiProvider('openai')).toBe(false);
  });

  it('ignores a custom address for providers with a fixed one', () => {
    expect(effectiveBaseUrl('anthropic', 'https://evil.example.com')).toBe(
      'https://api.anthropic.com',
    );
  });

  it('uses the default when no address is given, and trims a trailing slash', () => {
    expect(effectiveBaseUrl('ollama', null)).toBe('http://localhost:11434');
    expect(effectiveBaseUrl('openai_compatible', 'https://openrouter.ai/api/v1/')).toBe(
      'https://openrouter.ai/api/v1',
    );
  });

  it('shows only the last four characters of a key', () => {
    expect(apiKeyHint(' sk-ant-123456789 ')).toBe('6789');
  });
});
