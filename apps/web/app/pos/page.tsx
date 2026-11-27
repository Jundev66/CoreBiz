import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { send } from '@/api/client';

export const dynamic = 'force-dynamic';

export default async function PosLandingPage() {
  const headerStore = await headers();
  const host = headerStore.get('host') ?? '';
  const isLocalHost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const posUrl =
    process.env.NEXT_PUBLIC_POS_URL?.trim() ||
    (process.env.NODE_ENV === 'production' && !isLocalHost
      ? 'https://corebiz-pos.vercel.app'
      : 'http://localhost:3025');

  try {
    const result = await send<{ readonly handoffToken: string }>('POST', '/v1/pos/handoff', {});
    if (result.ok && result.value?.handoffToken) {
      redirect(`${posUrl}/?handoff=${encodeURIComponent(result.value.handoffToken)}`);
    }
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) {
      throw err;
    }
  }

  redirect(posUrl);
}
