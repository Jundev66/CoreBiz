import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  posDb,
  type LocalProduct,
  type LocalShift,
  type LocalSale,
  type LocalSaleLine,
  type LocalCustomer,
} from './db';
import {
  seedDemoDataIfEmpty,
  fetchErpDemoCatalog,
  DEMO_DEVICE_ID,
  DEMO_DEVICE_TOKEN,
} from './demo-seed';
import {
  queueOutboxOperation,
  syncCatalog,
  syncOutbox,
  syncCustomersFromErp,
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

export interface CustomerCheckoutInput {
  readonly name?: string;
  readonly doc?: string;
}

export function usePos(apiBaseUrl = '') {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingOutboxCount, setPendingOutboxCount] = useState<number>(0);
  const [currentShift, setCurrentShift] = useState<LocalShift | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [sales, setSales] = useState<LocalSale[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [registerCode, setRegisterCode] = useState<string | null>(null);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);
  const [defaultExchangeRate, setDefaultExchangeRate] = useState<string>('36.50');

  const activeExchangeRate = useMemo(() => {
    return (
      currentShift?.currentExchangeRateBcv ||
      currentShift?.openExchangeRateBcv ||
      defaultExchangeRate ||
      '36.50'
    );
  }, [currentShift, defaultExchangeRate]);

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

  const refreshState = useCallback(async () => {
    const shift = await posDb.shifts.where('status').equals('open').first();
    setCurrentShift(shift ?? null);

    const pending = await posDb.outbox
      .where('status')
      .anyOf(['pending', 'failed', 'syncing'])
      .count();
    setPendingOutboxCount(pending);

    const devId = await posDb.config.get('device_id');
    const regCode = await posDb.config.get('register_code');
    const token = await posDb.config.get('device_token');
    const rateEntry = await posDb.config.get('exchange_rate_bcv');

    setDeviceId(devId?.value ?? null);
    setRegisterCode(regCode?.value ?? null);
    setDeviceToken(token?.value ?? null);
    if (rateEntry?.value) {
      setDefaultExchangeRate(rateEntry.value);
    }

    const recentSales = await posDb.sales.orderBy('occurredAt').reverse().limit(100).toArray();
    setSales(recentSales);
  }, []);

  const triggerSync = useCallback(async () => {
    setIsSyncing(true);
    setSyncStatusMessage('Sincronizando con ERP...');

    try {
      await syncCustomersFromErp(apiBaseUrl);

      const devIdEntry = await posDb.config.get('device_id');
      const tokenEntry = await posDb.config.get('device_token');

      const token = tokenEntry?.value || DEMO_DEVICE_TOKEN;
      const deviceId = devIdEntry?.value || DEMO_DEVICE_ID;

      try {
        await syncCatalog(apiBaseUrl, token);
      } catch (e) {
        console.warn('Catalog sync error (non-blocking):', e);
      }

      const outboxResult = await syncOutbox(apiBaseUrl, token, deviceId);
      if (outboxResult.errors.length > 0) {
        setSyncStatusMessage(`Error: ${outboxResult.errors.join(', ')}`);
      } else if (outboxResult.syncedCount > 0) {
        setSyncStatusMessage(`${outboxResult.syncedCount} venta(s) sincronizada(s) con éxito.`);
      } else {
        setSyncStatusMessage('Todas las operaciones están sincronizadas.');
      }
      return outboxResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error en sincronización';
      setSyncStatusMessage(msg);
      console.error('POS Sync error:', err);
      return { syncedCount: 0, failedCount: 0, errors: [msg] };
    } finally {
      setIsSyncing(false);
      await refreshState();
    }
  }, [apiBaseUrl, refreshState]);

  const reloadDemoCatalog = useCallback(async () => {
    setIsSyncing(true);
    try {
      await fetchErpDemoCatalog(apiBaseUrl);
    } finally {
      setIsSyncing(false);
      await refreshState();
    }
  }, [apiBaseUrl, refreshState]);

  const searchCatalog = useCallback(async (query: string): Promise<LocalProduct[]> => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return posDb.catalog.limit(60).toArray();
    }

    return posDb.catalog
      .filter(
        (p) =>
          p.sku.toLowerCase().includes(trimmed) ||
          p.name.toLowerCase().includes(trimmed) ||
          (p.barcode ? p.barcode.includes(trimmed) : false),
      )
      .limit(60)
      .toArray();
  }, []);

  const searchCustomers = useCallback(async (query: string): Promise<LocalCustomer[]> => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return posDb.customers.limit(20).toArray();
    }

    return posDb.customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(trimmed) ||
          c.taxId.toLowerCase().includes(trimmed) ||
          c.code.toLowerCase().includes(trimmed),
      )
      .limit(20)
      .toArray();
  }, []);

  const saveCustomer = useCallback(
    async (customer: {
      id?: string;
      code?: string;
      name: string;
      taxId: string;
      email?: string | null | undefined;
      phone?: string | null | undefined;
    }): Promise<LocalCustomer> => {
      const id = customer.id || crypto.randomUUID();
      const code = customer.code || `CLI-${customer.taxId.replace(/[^A-Za-z0-9]/g, '').slice(-8)}`;
      const saved: LocalCustomer = {
        id,
        code,
        name: customer.name.trim(),
        taxId: customer.taxId.trim(),
        email: customer.email?.trim() ?? null,
        phone: customer.phone?.trim() ?? null,
      };
      await posDb.customers.put(saved);
      return saved;
    },
    [],
  );

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

  const openShift = useCallback(
    async (initialFloatMinor: string, exchangeRateBcv?: string, currency = 'USD') => {
      const regId =
        (await posDb.config.get('register_id'))?.value ?? '00000000-0000-0000-0000-000000000099';
      const devId =
        (await posDb.config.get('device_id'))?.value ?? '018e245a-0000-7000-8000-000000000001';
      const shiftId = crypto.randomUUID();
      const openedAt = new Date().toISOString();
      const rate = exchangeRateBcv?.trim() || defaultExchangeRate || '36.50';

      const newShift: LocalShift = {
        id: shiftId,
        registerId: regId,
        deviceId: devId,
        initialFloatMinor,
        currency,
        openExchangeRateBcv: rate,
        currentExchangeRateBcv: rate,
        rateAuditHistory: [
          {
            rate,
            changedAt: openedAt,
            reason: 'Apertura de turno',
          },
        ],
        status: 'open',
        openedAt,
      };

      await posDb.shifts.put(newShift);
      await posDb.config.put({ key: 'exchange_rate_bcv', value: rate });

      await queueOutboxOperation(crypto.randomUUID(), 'shift.open', {
        shiftId,
        registerId: regId,
        deviceId: devId,
        initialFloatMinor,
        currency,
        openExchangeRateBcv: rate,
        openedAt,
      });

      await refreshState();
      void triggerSync();
    },
    [defaultExchangeRate, refreshState, triggerSync],
  );

  const updateShiftExchangeRate = useCallback(
    async (newRate: string, reason?: string) => {
      const trimmed = newRate.trim();
      if (!trimmed || parseFloat(trimmed) <= 0) return;

      await posDb.config.put({ key: 'exchange_rate_bcv', value: trimmed });
      setDefaultExchangeRate(trimmed);

      if (currentShift) {
        const changedAt = new Date().toISOString();
        const history = currentShift.rateAuditHistory ?? [];
        const updatedHistory = [
          ...history,
          {
            rate: trimmed,
            changedAt,
            reason: reason?.trim() || 'Ajuste manual durante el turno',
          },
        ];

        await posDb.shifts.update(currentShift.id, {
          currentExchangeRateBcv: trimmed,
          rateAuditHistory: updatedHistory,
        });
      }

      await refreshState();
    },
    [currentShift, refreshState],
  );

  const closeShift = useCallback(
    async (declaredCashMinor: string, notes?: string) => {
      if (!currentShift) return null;

      const closedAt = new Date().toISOString();
      const initialFloat = BigInt(currentShift.initialFloatMinor);
      const declared = BigInt(declaredCashMinor);

      const variance = declared - initialFloat;
      const finalRate =
        currentShift.currentExchangeRateBcv || currentShift.openExchangeRateBcv || '36.50';

      await posDb.shifts.update(currentShift.id, {
        status: 'closed',
        closedAt,
        closeExchangeRateBcv: finalRate,
        declaredCashMinor,
        varianceMinor: variance.toString(),
        notes: notes ?? null,
      });

      await queueOutboxOperation(crypto.randomUUID(), 'shift.close', {
        shiftId: currentShift.id,
        declaredCashMinor,
        closedAt,
        openExchangeRateBcv: currentShift.openExchangeRateBcv,
        closeExchangeRateBcv: finalRate,
        rateAuditHistory: currentShift.rateAuditHistory ?? [],
        ...(notes ? { notes } : {}),
      });

      await refreshState();
      void triggerSync();

      return {
        varianceMinor: variance.toString(),
        declaredCashMinor,
        initialFloatMinor: currentShift.initialFloatMinor,
        openExchangeRateBcv: currentShift.openExchangeRateBcv,
        closeExchangeRateBcv: finalRate,
        rateAuditHistory: currentShift.rateAuditHistory ?? [],
      };
    },
    [currentShift, refreshState, triggerSync],
  );

  const checkoutSale = useCallback(
    async (
      paymentMethod: 'cash' | 'card' | 'transfer' | 'split',
      customer?: CustomerCheckoutInput,
    ) => {
      if (!currentShift || cart.length === 0) return null;

      const regId = currentShift.registerId;
      const devId = currentShift.deviceId;
      const shiftId = currentShift.id;
      const saleId = crypto.randomUUID();
      const operationId = crypto.randomUUID();
      const occurredAt = new Date().toISOString();

      const ticketNumber = `${registerCode ?? 'CAJA-01'}-${Date.now().toString().slice(-6)}`;
      const invoiceControlNumber = `00-${Date.now().toString().slice(-8)}`;
      const customerName = customer?.name?.trim() || 'Consumidor Final';
      const customerDoc = customer?.doc?.trim() || 'V-00000000';

      const saleLines: LocalSaleLine[] = cart.map((item) => ({
        id: item.id,
        productId: item.productId,
        sku: item.sku,
        name: item.name,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor.toString(),
        lineTotalMinor: item.lineTotalMinor.toString(),
      }));

      const outboxLines = cart.map((item) => ({
        id: item.id,
        productId: item.productId,
        temporaryName: item.productId ? null : item.name,
        barcodeScanned: item.barcodeScanned,
        quantity: item.quantity.toString(),
        unitPriceMinor: item.unitPriceMinor.toString(),
      }));

      const activeRate =
        currentShift.currentExchangeRateBcv ||
        currentShift.openExchangeRateBcv ||
        defaultExchangeRate ||
        '36.50';

      const localSaleRecord: LocalSale = {
        id: saleId,
        operationId,
        ticketNumber,
        invoiceControlNumber,
        customerName,
        customerDoc,
        shiftId,
        registerCode: registerCode ?? 'CAJA-01',
        paymentMethod,
        subtotalMinor: cartTotals.subtotalMinor.toString(),
        taxMinor: cartTotals.taxMinor.toString(),
        totalMinor: cartTotals.totalMinor.toString(),
        exchangeRateBcv: activeRate,
        lines: saleLines,
        occurredAt,
        syncStatus: 'pending',
      };

      await posDb.sales.put(localSaleRecord);

      if (customerDoc && customerDoc !== 'V-00000000') {
        const existingCust = await posDb.customers.where('taxId').equals(customerDoc).first();
        if (!existingCust) {
          await posDb.customers.put({
            id: crypto.randomUUID(),
            code: `CLI-${customerDoc.replace(/[^A-Za-z0-9]/g, '').slice(-8)}`,
            name: customerName,
            taxId: customerDoc,
          });
        }
      }

      await queueOutboxOperation(operationId, 'sale.issue', {
        saleId,
        operationId,
        registerId: regId,
        deviceId: devId,
        shiftId,
        ticketNumber,
        invoiceControlNumber,
        customerName,
        customerDoc,
        paymentMethod,
        lines: outboxLines,
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
      if (navigator.onLine) {
        await triggerSync();
      }
      await refreshState();

      const latestSale = await posDb.sales.get(saleId);

      return {
        saleId,
        ticketNumber,
        invoiceControlNumber,
        totalMinor: cartTotals.totalMinor,
        subtotalMinor: cartTotals.subtotalMinor,
        taxMinor: cartTotals.taxMinor,
        exchangeRateBcv: activeRate,
        customerName,
        customerDoc,
        lines: saleLines,
        paymentMethod,
        occurredAt,
        syncStatus: latestSale?.syncStatus ?? 'pending',
      };
    },
    [
      currentShift,
      cart,
      registerCode,
      cartTotals,
      clearCart,
      refreshState,
      triggerSync,
      defaultExchangeRate,
    ],
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
    setIsOnline(navigator.onLine);
    void (async () => {
      await seedDemoDataIfEmpty();
      await refreshState();
      void triggerSync();
    })();

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
  }, [refreshState, triggerSync]);

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
    sales,
    deviceId,
    registerCode,
    deviceToken,
    isSyncing,
    syncStatusMessage,
    activeExchangeRate,
    defaultExchangeRate,
    totals: cartTotals,
    addToCart,
    addUncatalogedItem,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    openShift,
    updateShiftExchangeRate,
    closeShift,
    checkoutSale,
    triggerSync,
    reloadDemoCatalog,
    enrollDevice,
    searchCatalog,
    searchCustomers,
    saveCustomer,
    refreshState,
  };
}
