export function getPosTerminalUrl(): string {
  if (process.env.NEXT_PUBLIC_POS_URL) {
    return process.env.NEXT_PUBLIC_POS_URL;
  }
  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:3025';
  }
  return '/pos';
}
