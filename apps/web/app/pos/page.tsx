import { redirect } from 'next/navigation';

export default function PosLandingPage() {
  const posUrl =
    process.env.NEXT_PUBLIC_POS_URL?.trim() ||
    (process.env.NODE_ENV === 'production'
      ? 'https://corebiz-pos.vercel.app'
      : 'http://localhost:3025');

  redirect(posUrl);
}
