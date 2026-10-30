export function createKeyboardWedgeListener(
  onBarcode: (barcode: string) => void,
  maxIntervalMs = 50,
): () => void {
  let buffer = '';
  let lastTime = 0;

  function handleKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const isTextInput =
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    if (isTextInput && !target.hasAttribute('data-barcode-receiver')) {
      return;
    }

    const now = Date.now();
    const interval = now - lastTime;
    lastTime = now;

    if (event.key === 'Enter') {
      if (buffer.length >= 3 && interval < maxIntervalMs * 2) {
        event.preventDefault();
        onBarcode(buffer.trim());
      }
      buffer = '';
      return;
    }

    if (event.key.length === 1) {
      if (interval > maxIntervalMs && buffer.length > 0) {
        buffer = '';
      }
      buffer += event.key;
    }
  }

  window.addEventListener('keydown', handleKeyDown);

  return () => {
    window.removeEventListener('keydown', handleKeyDown);
  };
}

export async function detectBarcodeFromMedia(
  imageSource: ImageBitmapSource,
): Promise<string | null> {
  const globalWithBarcode = window as unknown as {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
    };
  };

  if (!globalWithBarcode.BarcodeDetector) {
    return null;
  }

  try {
    const detector = new globalWithBarcode.BarcodeDetector({
      formats: ['ean_13', 'code_128', 'qr_code', 'upc_a'],
    });
    const results = await detector.detect(imageSource);
    if (results.length > 0 && results[0]?.rawValue) {
      return results[0].rawValue;
    }
  } catch {
    return null;
  }

  return null;
}
