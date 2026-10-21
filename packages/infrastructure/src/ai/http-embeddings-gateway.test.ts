import { describe, expect, it } from 'vitest';
import { httpEmbeddingsGateway } from './http-embeddings-gateway';

interface Recorded {
  url: string;
  init: RequestInit;
}

function fakeFetch(status: number, body: unknown) {
  const calls: Recorded[] = [];
  const fn = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
    );
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const publicDns = () => Promise.resolve(['104.18.0.1']);

const vec = (n: number) => Array.from({ length: n }, () => 0.1);

function gateway(status: number, body: unknown, allowPrivate = false, dimensions = 3) {
  const fake = fakeFetch(status, body);
  return {
    calls: fake.calls,
    gw: httpEmbeddingsGateway({
      baseUrl: 'https://embeddings.example',
      apiKey: 'biz_live_test',
      model: 'nomic-embed-text',
      dimensions,
      allowPrivateBaseUrls: allowPrivate,
      fetch: fake.fn,
      resolve: publicDns,
    }),
  };
}

const sentBody = (call: Recorded | undefined) =>
  JSON.parse(call?.init.body as string) as Record<string, unknown>;

describe('httpEmbeddingsGateway', () => {
  it('posts to /v1/embeddings with the model and the texts', async () => {
    const { gw, calls } = gateway(200, {
      object: 'list',
      model: 'nomic-embed-text',
      data: [
        { object: 'embedding', index: 0, embedding: vec(3) },
        { object: 'embedding', index: 1, embedding: vec(3) },
      ],
    });

    const result = await gw.embed({ texts: ['harina', 'azucar'] });

    expect(result).toHaveLength(2);
    expect(calls[0]?.url).toBe('https://embeddings.example/v1/embeddings');
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe(
      'Bearer biz_live_test',
    );
    expect(sentBody(calls[0])).toEqual({ model: 'nomic-embed-text', input: ['harina', 'azucar'] });
    expect(gw.model).toBe('nomic-embed-text');
    expect(gw.dimensions).toBe(3);
  });

  it('reorders the vectors by index, not by arrival', async () => {
    const { gw } = gateway(200, {
      data: [
        { index: 1, embedding: [0.2, 0.2, 0.2] },
        { index: 0, embedding: [0.1, 0.1, 0.1] },
      ],
    });

    const result = await gw.embed({ texts: ['a', 'b'] });
    expect(result[0]).toEqual([0.1, 0.1, 0.1]);
    expect(result[1]).toEqual([0.2, 0.2, 0.2]);
  });

  it('returns nothing for an empty input without calling the provider', async () => {
    const { gw, calls } = gateway(200, { data: [] });
    expect(await gw.embed({ texts: [] })).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('rejects a vector whose dimension does not match the schema', async () => {
    const { gw } = gateway(200, { data: [{ index: 0, embedding: vec(4) }] }, false, 3);
    await expect(gw.embed({ texts: ['a'] })).rejects.toThrow('EMBEDDINGS_DIMENSION_MISMATCH');
  });

  it('refuses a private address unless the deployment allows it (SSRF)', async () => {
    const fake = fakeFetch(200, { data: [{ index: 0, embedding: vec(3) }] });
    const privateDns = () => Promise.resolve(['10.0.0.5']);
    const gw = httpEmbeddingsGateway({
      baseUrl: 'http://ollama.internal',
      model: 'nomic-embed-text',
      dimensions: 3,
      allowPrivateBaseUrls: false,
      fetch: fake.fn,
      resolve: privateDns,
    });

    await expect(gw.embed({ texts: ['a'] })).rejects.toThrow('EMBEDDINGS_BASE_URL_NOT_ALLOWED');
    expect(fake.calls).toHaveLength(0);
  });

  it('surfaces the status, never the provider message', async () => {
    const { gw } = gateway(500, { error: { message: 'secret key echoed back' } });
    await expect(gw.embed({ texts: ['a'] })).rejects.toThrow('EMBEDDINGS_HTTP_500');
  });
});
