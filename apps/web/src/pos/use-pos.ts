'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { posDb, type LocalProduct, type LocalShift } from './db';
import {
  queueOutboxOperation,
  syncCatalog,
  syncOutbox,
  registerOnlineSyncListener,
} from './sync-engine';
import { createKeyboardWedgeListener } from './barcode';

export interface CartLine {
  readonly id: string;
  readonly productId: string | null;
  readonly sku: string | null;
  readonly name: string;
  readonly barcodeScanned: string | null;
  readonly quantity: number;
  readonly unitPriceMinor: bigint;
  readonly lineTotalMinor: bigint;
}

export function usePos(apiBaseUrl = '/api') {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingOutboxCount, setPendingOutboxCount] = useState<number>(0);
  const [currentShift, setCurrentShift] = useState<LocalShift | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [registerCode, setRegisterCode] = useState<string | null>(null);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const refreshState = useCallback(async () => {
    const shift = await posDb.shifts.where('status').equals('open').first();
    setCurrentShift(shift ?? null);

    const pending = await posDb.outbox.where('status').equals('pending').count();
    setPendingOutboxCount(pending);

    const devId = await posDb.config.get('device_id');
    const regCode = await posDb.config.get('register_code');
    const token = await posDb.config.get('device_token');

    setDeviceId(devId?.value ?? null);
    setRegisterCode(regCode?.value ?? null);
    setDeviceToken(token?.value ?? null);
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    void refreshState();

    const cleanupOnline = registerOnlineSyncListener(() => {
      setIsOnline(true);
      void triggerSync();
    });

    const handleOffline = () => setIsOnline(false);
    window.addEventListener('offline', handleOffline);

    return () => {
      cleanupOnline();
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshState]);

  const triggerSync = useCallback(async () => {
    if (!navigator.onLine) return;
    setIsSyncing(true);

    try {
      const devIdEntry = await posDb.config.get('device_id');
      const tokenEntry = await posDb.config.get('device_token');

      if (tokenEntry?.value) {
        await syncCatalog(apiBaseUrl, tokenEntry.value);
        if (devIdEntry?.value) {
          await syncOutbox(apiBaseUrl, tokenEntry.value, devIdEntry.value);
        }
      }
    } finally {
      setIsSyncing(false);
      await refreshState();
    }
  }, [apiBaseUrl, refreshState]);

  const searchCatalog = useCallback(async (query: string): Promise<LocalProduct[]> => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];

    return posDb.catalog
      .filter(
        (p) =>
          p.sku.toLowerCase().includes(trimmed) ||
          p.name.toLowerCase().includes(trimmed) ||
          (p.barcode ? p.barcode.includes(trimmed) : false),
      )
      .limit(20)
      .toArray();
  }, []);

  const addToCart = useCallback((product: LocalProduct, qty = 1) => {
    const priceMinor = BigInt(Math.round(parseFloat(product.price || '0') * 100));

    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        const nextQty = existing.quantity + qty;
        const lineTotalMinor = BigInt(nextQty) * existing.unitPriceMinor;
        return prev.map((item) =>
          item.id === existing.id ? { ...item, quantity: nextQty, lineTotalMinor } : item,
        );
      }

      const lineTotalMinor = BigInt(qty) * priceMinor;
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          productId: product.id,
          sku: product.sku,
          name: product.name,
          barcodeScanned: product.barcode ?? null,
          quantity: qty,
          unitPriceMinor: priceMinor,
          lineTotalMinor,
        },
      ];
    });
  }, []);

  const addUncatalogedItem = useCallback(
    (name: string, priceMinor: bigint, barcodeScanned?: string) => {
      const id = crypto.randomUUID();
      const lineTotalMinor = priceMinor;

      setCart((prev) => [
        ...prev,
        {
          id,
          productId: null,
          sku: 'VARIOS',
          name: name.trim() || 'Venta Varios',
          barcodeScanned: barcodeScanned ?? null,
          quantity: 1,
          unitPriceMinor: priceMinor,
          lineTotalMinor,
        },
      ]);
    },
    [],
  );

  const updateCartQuantity = useCallback((lineId: string, quantity: number) => {
    setCart((prev) => {
      if (quantity <= 0) {
        return prev.filter((item) => item.id !== lineId);
      }
      return prev.map((item) => {
        if (item.id !== lineId) return item;
        const lineTotalMinor = BigInt(quantity) * item.unitPriceMinor;
        return { ...item, quantity, lineTotalMinor };
      });
    });
  }, []);

  const removeFromCart = useCallback((lineId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== lineId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const cartTotals = useMemo(() => {
    let subtotal = 0n;
    for (const item of cart) {
      subtotal += item.lineTotalMinor;
    }
    const tax = (subtotal * 1600n) / 10000n;
    const total = subtotal + tax;

    return {
      subtotalMinor: subtotal,
      taxMinor: tax,
      totalMinor: total,
    };
  }, [cart]);

  const openShift = useCallback(
    async (initialFloatMinor: string, currency = 'USD') => {
      const regId = (await posDb.config.get('register_id'))?.value ?? 'reg-default';
      const devId = (await posDb.config.get('device_id'))?.value ?? 'dev-default';
      const shiftId = crypto.randomUUID();
      const openedAt = new Date().toISOString();

      const newShift: LocalShift = {
        id: shiftId,
        registerId: regId,
        deviceId: devId,
        initialFloatMinor,
        currency,
        status: 'open',
        openedAt,
      };

      await posDb.shifts.put(newShift);

      await queueOutboxOperation(crypto.randomUUID(), 'shift.open', {
        shiftId,
        registerId: regId,
        deviceId: devId,
        initialFloatMinor,
        currency,
        openedAt,
      });

      await refreshState();
      void triggerSync();
    },
    [refreshState, triggerSync],
  );

  const closeShift = useCallback(
    async (declaredCashMinor: string, notes?: string) => {
      if (!currentShift) return null;

      const closedAt = new Date().toISOString();
      const initialFloat = BigInt(currentShift.initialFloatMinor);
      const declared = BigInt(declaredCashMinor);

      const variance = declared - initialFloat;

      await posDb.shifts.update(currentShift.id, {
        status: 'closed',
        closedAt,
        declaredCashMinor,
        varianceMinor: variance.toString(),
        notes: notes ?? null,
      });

      await queueOutboxOperation(crypto.randomUUID(), 'shift.close', {
        shiftId: currentShift.id,
        declaredCashMinor,
        closedAt,
        ...(notes ? { notes } : {}),
      });

      await refreshState();
      void triggerSync();

      return {
        varianceMinor: variance.toString(),
        declaredCashMinor,
        initialFloatMinor: currentShift.initialFloatMinor,
      };
    },
    [currentShift, refreshState, triggerSync],
  );

  const checkoutSale = useCallback(
    async (paymentMethod: 'cash' | 'card' | 'transfer' | 'split') => {
      if (!currentShift || cart.length === 0) return null;

      const regId = currentShift.registerId;
      const devId = currentShift.deviceId;
      const shiftId = currentShift.id;
      const saleId = crypto.randomUUID();
      const operationId = crypto.randomUUID();
      const occurredAt = new Date().toISOString();

      const ticketNumber = `${registerCode ?? 'POS-01'}-${Date.now().toString().slice(-6)}`;

      const lines = cart.map((item) => ({
        id: item.id,
        productId: item.productId,
        temporaryName: item.productId ? null : item.name,
        barcodeScanned: item.barcodeScanned,
        quantity: item.quantity.toString(),
        unitPriceMinor: item.unitPriceMinor.toString(),
      }));

      await queueOutboxOperation(operationId, 'sale.issue', {
        saleId,
        operationId,
        registerId: regId,
        deviceId: devId,
        shiftId,
        ticketNumber,
        paymentMethod,
        lines,
        occurredAt,
      });

      for (const item of cart) {
        if (item.productId) {
          const prod = await posDb.catalog.get(item.productId);
          if (prod && prod.trackStock) {
            const currentOnHand = parseFloat(prod.onHand || '0');
            const nextOnHand = Math.max(0, currentOnHand - item.quantity);
            await posDb.catalog.update(item.productId, {
              onHand: nextOnHand.toString(),
            });
          }
        }
      }

      clearCart();
      await refreshState();
      void triggerSync();

      return { saleId, ticketNumber, totalMinor: cartTotals.totalMinor };
    },
    [currentShift, cart, registerCode, cartTotals.totalMinor, clearCart, refreshState, triggerSync],
  );

  const enrollDevice = useCallback(
    async (pairingCode: string, name: string) => {
      let installId = (await posDb.config.get('installation_id'))?.value;
      if (!installId) {
        installId = crypto.randomUUID();
        await posDb.config.put({ key: 'installation_id', value: installId });
      }

      const res = await fetch(`${apiBaseUrl}/v1/pos/devices/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          installationId: installId,
          name,
          pairingCode,
        }),
      });

      if (!res.ok) {
        throw new Error(`Enrollment failed with status: ${res.status}`);
      }

      const data = (await res.json()) as {
        deviceId: string;
        registerId: string;
        registerCode: string;
        deviceToken: string;
      };

      await posDb.config.put({ key: 'device_id', value: data.deviceId });
      await posDb.config.put({ key: 'register_id', value: data.registerId });
      await posDb.config.put({ key: 'register_code', value: data.registerCode });
      await posDb.config.put({ key: 'device_token', value: data.deviceToken });

      await refreshState();
      void triggerSync();

      return data;
    },
    [apiBaseUrl, refreshState, triggerSync],
  );

  useEffect(() => {
    const cleanupWedge = createKeyboardWedgeListener((scannedCode) => {
      void (async () => {
        const match = await posDb.catalog
          .filter((p) => p.barcode === scannedCode || p.sku === scannedCode)
          .first();

        if (match) {
          addToCart(match);
        } else {
          addUncatalogedItem(`Item (${scannedCode})`, 1000n, scannedCode);
        }
      })();
    });

    return () => {
      cleanupWedge();
    };
  }, [addToCart, addUncatalogedItem]);

  return {
    isOnline,
    pendingOutboxCount,
    currentShift,
    cart,
    deviceId,
    registerCode,
    deviceToken,
    isSyncing,
    totals: cartTotals,
    addToCart,
    addUncatalogedItem,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    openShift,
    closeShift,
    checkoutSale,
    triggerSync,
    enrollDevice,
    searchCatalog,
  };
}
