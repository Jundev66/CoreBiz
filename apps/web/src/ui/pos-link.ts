export function getPosTerminalUrl(): string {
  if (process.env.NEXT_PUBLIC_POS_URL && process.env.NEXT_PUBLIC_POS_URL.trim().length > 0) {
    return process.env.NEXT_PUBLIC_POS_URL.trim();
  }
  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:3025';
  }
  return 'https://corebiz-pos.vercel.app';
}
