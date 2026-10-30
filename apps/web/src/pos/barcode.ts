export function computeEan13CheckDigit(first12Digits: string): number {
  if (!/^\d{12}$/.test(first12Digits)) {
    throw new Error('EAN-13 base must be exactly 12 digits');
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(first12Digits.charAt(i));
    sum += i % 2 === 0 ? digit : digit * 3;
  }

  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

export function generateInternalBarcode(counter?: number): string {
  const prefix = '20';
  let middleDigits = '';

  if (typeof counter === 'number' && counter >= 0) {
    middleDigits = counter.toString().padStart(10, '0').slice(-10);
  } else {
    for (let i = 0; i < 10; i++) {
      middleDigits += Math.floor(Math.random() * 10).toString();
    }
  }

  const base12 = `${prefix}${middleDigits}`;
  const checkDigit = computeEan13CheckDigit(base12);
  return `${base12}${checkDigit}`;
}

export function isValidEan13(barcode: string): boolean {
  if (!/^\d{13}$/.test(barcode)) {
    return false;
  }
  const base12 = barcode.slice(0, 12);
  const checkDigit = Number(barcode.charAt(12));
  return computeEan13CheckDigit(base12) === checkDigit;
}

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
