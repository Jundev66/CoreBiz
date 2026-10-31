import { useState, useRef, useEffect } from 'react';
import {
  RefreshCw,
  ShoppingCart,
  Barcode,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Camera,
  Search,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  X,
  Package,
  Sparkles,
  Menu,
  Coins,
  ReceiptText,
  Banknote,
  Check,
  Printer,
  Download,
  Eye,
  FileText,
  User,
  Users,
  Clock,
  TrendingUp,
  Smartphone,
  Maximize2,
  Minimize2,
  Pencil,
} from 'lucide-react';
import { usePos } from './use-pos';
import { detectBarcodeFromMedia, generateInternalBarcode } from './barcode';
import { printInvoice, downloadInvoiceFile } from './invoice';
import type { LocalProduct, LocalSale, LocalCustomer } from './db';

export function App() {
  const {
    isOnline,
    pendingOutboxCount,
    currentShift,
    cart,
    sales,
    registerCode,
    isSyncing,
    syncStatusMessage,
    totals,
    activeExchangeRate,
    defaultExchangeRate,
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
  } = usePos();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LocalProduct[]>([]);
  const [catalogFilterMode, setCatalogFilterMode] = useState<'all' | 'in_stock'>('all');
  const [showCatalogDrawer, setShowCatalogDrawer] = useState(false);
  const [showSalesModal, setShowSalesModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);
  const [showVariosModal, setShowVariosModal] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showCashCheckoutModal, setShowCashCheckoutModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState<LocalCustomer | null>(null);
  const [checkoutCustomerSearch, setCheckoutCustomerSearch] = useState('');
  const [checkoutCustomerList, setCheckoutCustomerList] = useState<LocalCustomer[]>([]);
  const [isCreatingCustomerInCheckout, setIsCreatingCustomerInCheckout] = useState(false);

  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState<LocalCustomer[]>([]);
  const [customerModalTab, setCustomerModalTab] = useState<'search' | 'create'>('search');
  const [newCustName, setNewCustName] = useState('');
  const [newCustTaxId, setNewCustTaxId] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');

  const [initialFloatInput, setInitialFloatInput] = useState('50.00');
  const [openShiftRateInput, setOpenShiftRateInput] = useState('36.50');
  const [newRateInput, setNewRateInput] = useState('');
  const [rateChangeReasonInput, setRateChangeReasonInput] = useState('');
  const [declaredCashInput, setDeclaredCashInput] = useState('');
  const [cashTenderedInput, setCashTenderedInput] = useState('');
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<
    'cash_usd' | 'cash_ves' | 'pago_movil' | 'punto_debito'
  >('cash_usd');
  const [isEditingRateInCheckout, setIsEditingRateInCheckout] = useState(false);
  const [checkoutNewRateInput, setCheckoutNewRateInput] = useState('');
  const [vesTenderedInput, setVesTenderedInput] = useState('');
  const [variosName, setVariosName] = useState('Artículo Varios');
  const [variosPrice, setVariosPrice] = useState('10.00');
  const [enrollPairingCode, setEnrollPairingCode] = useState('CAJA-01');
  const [enrollDeviceName, setEnrollDeviceName] = useState('Terminal Móvil');

  const [lastSaleSuccess, setLastSaleSuccess] = useState<{
    readonly sale: LocalSale;
    readonly ticketNumber: string;
    readonly total: string;
    readonly change?: string | undefined;
  } | null>(null);

  const [selectedSaleDetail, setSelectedSaleDetail] = useState<LocalSale | null>(null);

  const [shiftReconciliationResult, setShiftReconciliationResult] = useState<{
    readonly declared: string;
    readonly variance: string;
    readonly openRate: string;
    readonly closeRate: string;
    readonly rateHistoryCount: number;
  } | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (defaultExchangeRate) {
      setOpenShiftRateInput(defaultExchangeRate);
    }
  }, [defaultExchangeRate]);

  useEffect(() => {
    void (async () => {
      const results = await searchCatalog(searchQuery);
      setSearchResults(results);
    })();
  }, [searchQuery, searchCatalog, isSyncing]);

  useEffect(() => {
    if (!showCustomerModal) return;
    void (async () => {
      const results = await searchCustomers(customerSearchQuery);
      setCustomerSearchResults(results);
    })();
  }, [customerSearchQuery, searchCustomers, showCustomerModal]);

  useEffect(() => {
    if (!showCashCheckoutModal) return;
    void (async () => {
      const results = await searchCustomers(checkoutCustomerSearch);
      setCheckoutCustomerList(results);
    })();
  }, [showCashCheckoutModal, checkoutCustomerSearch, searchCustomers]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    if (!showCameraModal) return;

    let stream: MediaStream | null = null;
    let animFrame: number;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();

          const scanLoop = () => {
            void (async () => {
              if (
                videoRef.current &&
                videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA
              ) {
                const code = await detectBarcodeFromMedia(videoRef.current);
                if (code) {
                  const match = await searchCatalog(code);
                  if (match.length > 0 && match[0]) {
                    addToCart(match[0]);
                  } else {
                    addUncatalogedItem(`Scanner (${code})`, 1000n, code);
                  }
                  setShowCameraModal(false);
                  return;
                }
              }
              animFrame = requestAnimationFrame(scanLoop);
            })();
          };
          animFrame = requestAnimationFrame(scanLoop);
        }
      } catch {
        setShowCameraModal(false);
      }
    }

    void startCamera();

    return () => {
      cancelAnimationFrame(animFrame);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [showCameraModal, searchCatalog, addToCart, addUncatalogedItem]);

  const handleOpenShift = async () => {
    const minor = Math.round(parseFloat(initialFloatInput || '0') * 100).toString();
    const rate = openShiftRateInput.trim() || defaultExchangeRate || '36.50';
    await openShift(minor, rate);
    setShowOpenShiftModal(false);
  };

  const handleUpdateRate = async () => {
    if (!newRateInput.trim()) return;
    await updateShiftExchangeRate(newRateInput, rateChangeReasonInput);
    setShowRateModal(false);
    setNewRateInput('');
    setRateChangeReasonInput('');
  };

  const handleCloseShift = async () => {
    const minor = Math.round(parseFloat(declaredCashInput || '0') * 100).toString();
    const res = await closeShift(minor);
    if (res) {
      setShiftReconciliationResult({
        declared: (parseFloat(res.declaredCashMinor) / 100).toFixed(2),
        variance: (parseFloat(res.varianceMinor) / 100).toFixed(2),
        openRate: res.openExchangeRateBcv,
        closeRate: res.closeExchangeRateBcv,
        rateHistoryCount: res.rateAuditHistory.length,
      });
    }
    setShowCloseShiftModal(false);
  };

  const handleAddVarios = () => {
    const minor = BigInt(Math.round(parseFloat(variosPrice || '0') * 100));
    const randomBarcode = generateInternalBarcode();
    addUncatalogedItem(variosName, minor, randomBarcode);
    setShowVariosModal(false);
    setVariosName('Artículo Varios');
    setVariosPrice('10.00');
  };

  const handleEnroll = async () => {
    await enrollDevice(enrollPairingCode, enrollDeviceName);
    setShowEnrollModal(false);
  };

  const handleOpenCheckoutModal = (preferredMethod?: 'cash_usd' | 'cash_ves' | 'usd' | 'ves') => {
    const method =
      preferredMethod === 'ves' || preferredMethod === 'cash_ves' ? 'cash_ves' : 'cash_usd';
    setCheckoutPaymentMethod(method);
    setCheckoutCustomerSearch('');
    setIsCreatingCustomerInCheckout(false);
    setIsEditingRateInCheckout(false);
    setCheckoutNewRateInput(activeExchangeRate);
    setCashTenderedInput(totalDecimal.toFixed(2));
    setVesTenderedInput(totalVesDecimal.toFixed(2));
    setShowCashCheckoutModal(true);
  };

  const handleCreateCustomerInCheckout = async () => {
    if (!newCustName.trim() || !newCustTaxId.trim()) return;
    const saved = await saveCustomer({
      name: newCustName.trim(),
      taxId: newCustTaxId.trim(),
      phone: newCustPhone.trim() || null,
    });
    setSelectedCustomer(saved);
    setIsCreatingCustomerInCheckout(false);
    setNewCustName('');
    setNewCustTaxId('');
    setNewCustPhone('');
  };

  const handleCheckout = async (
    method: 'cash' | 'card' | 'transfer' | 'split',
    changeAmount?: string,
  ) => {
    if (!selectedCustomer) return;

    const res = await checkoutSale(method, {
      name: selectedCustomer.name,
      doc: selectedCustomer.taxId,
    });

    if (res) {
      const saleRecord: LocalSale = {
        id: res.saleId,
        operationId: res.saleId,
        ticketNumber: res.ticketNumber,
        invoiceControlNumber: res.invoiceControlNumber,
        customerName: res.customerName,
        customerDoc: res.customerDoc,
        shiftId: currentShift?.id ?? '',
        registerCode: registerCode ?? 'CAJA-01',
        paymentMethod: method,
        subtotalMinor: res.subtotalMinor.toString(),
        taxMinor: res.taxMinor.toString(),
        totalMinor: res.totalMinor.toString(),
        exchangeRateBcv: res.exchangeRateBcv,
        lines: res.lines,
        occurredAt: res.occurredAt,
        syncStatus: res.syncStatus,
      };

      setLastSaleSuccess({
        sale: saleRecord,
        ticketNumber: res.ticketNumber,
        total: (Number(res.totalMinor) / 100).toFixed(2),
        change: changeAmount,
      });

      setSelectedCustomer(null);
      setCheckoutCustomerSearch('');
      setIsCreatingCustomerInCheckout(false);
      setCashTenderedInput('');
      setVesTenderedInput('');
      setShowCashCheckoutModal(false);
    }
  };

  const handleCreateAndSelectCustomer = async () => {
    if (!newCustName.trim() || !newCustTaxId.trim()) return;
    const saved = await saveCustomer({
      name: newCustName.trim(),
      taxId: newCustTaxId.trim(),
      phone: newCustPhone.trim() || null,
    });
    setSelectedCustomer(saved);
    setShowCustomerModal(false);
    setNewCustName('');
    setNewCustTaxId('');
    setNewCustPhone('');
  };

  const rateNum = parseFloat(activeExchangeRate || '36.50') || 36.5;
  const totalDecimal = Number(totals.totalMinor) / 100;
  const totalVesDecimal = totalDecimal * rateNum;
  const totalItemCount = cart.reduce((acc, l) => acc + l.quantity, 0);

  const displayedCatalog = searchResults.filter((p) => {
    if (catalogFilterMode === 'in_stock') {
      return parseFloat(p.onHand) > 0;
    }
    return true;
  });

  const getCartQuantity = (productId: string) => {
    const item = cart.find((l) => l.productId === productId);
    return item ? item.quantity : 0;
  };

  const tenderedNumber = parseFloat(cashTenderedInput || '0');
  const changeValue = Math.max(0, tenderedNumber - totalDecimal);

  const vesTenderedNumber = parseFloat(vesTenderedInput || '0');
  const vesChangeValue = Math.max(0, vesTenderedNumber - totalVesDecimal);

  const totalSalesAmount = sales.reduce((acc, s) => acc + Number(s.totalMinor) / 100, 0);
  const syncedSalesCount = sales.filter((s) => s.syncStatus === 'synced').length;
  const pendingSalesCount = sales.filter((s) => s.syncStatus !== 'synced').length;

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults.length > 0 && searchResults[0]) {
        addToCart(searchResults[0]);
        setSearchQuery('');
      }
    }
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F4') {
        e.preventDefault();
        if (cart.length > 0 && currentShift) {
          handleOpenCheckoutModal('usd');
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [cart.length, currentShift, totalDecimal, totalVesDecimal]);

  return (
    <div className="flex h-screen w-screen flex-col bg-canvas font-sans text-ink antialiased select-none">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-3 sm:px-6 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand font-black text-white shadow-xs">
              CB
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold tracking-tight text-ink">CoreBiz POS</h1>
                <span className="rounded-pill border border-line bg-subtle px-2 py-0.5 text-[10px] font-bold text-ink-soft">
                  {registerCode ? registerCode : 'Sin Caja'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-[11px] font-medium text-muted">
                  <span
                    className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`}
                  />
                  {isOnline ? 'En línea' : 'Offline'}
                </span>
                {pendingOutboxCount > 0 && (
                  <button
                    onClick={() => {
                      void triggerSync();
                    }}
                    className="flex items-center gap-1 rounded-pill bg-warn-soft border border-warn/30 px-2 py-0.2 text-[10px] font-bold text-warn-ink hover:bg-warn-soft/80 transition cursor-pointer"
                    title="Hay ventas u operaciones en cola local. Hacé clic para reintentar sincronización."
                  >
                    <Clock className="h-2.5 w-2.5" />
                    {pendingOutboxCount} en cola
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentShift ? (
            <>
              <button
                onClick={() => setShowCloseShiftModal(true)}
                className="hidden sm:flex items-center gap-1.5 rounded-xl border border-success/30 bg-success-soft px-3 py-1.5 text-xs font-bold text-success-ink transition hover:bg-success-soft/80 cursor-pointer"
                title="Turno abierto. Click para cerrar y arquear."
              >
                <Unlock className="h-3.5 w-3.5 text-success" />
                <span>
                  Caja Abierta (${(parseFloat(currentShift.initialFloatMinor) / 100).toFixed(0)})
                </span>
              </button>

              <button
                onClick={() => {
                  setNewRateInput(activeExchangeRate);
                  setShowRateModal(true);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 py-1.5 text-xs font-bold text-ink transition hover:border-brand/40 shadow-xs cursor-pointer"
                title="Tasa oficial BCV activa del turno. Click para auditar o ajustar."
              >
                <TrendingUp className="h-3.5 w-3.5 text-brand" />
                <span className="font-mono text-ink text-[11px] sm:text-xs">
                  Bs. {activeExchangeRate}
                </span>
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowOpenShiftModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 cursor-pointer"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Abrir Turno</span>
            </button>
          )}

          <button
            onClick={() => setShowCatalogDrawer(true)}
            className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-bold text-ink hover:bg-subtle transition shadow-xs cursor-pointer"
            title="Abrir catálogo visual"
          >
            <Package className="h-3.5 w-3.5 text-brand" />
            <span className="hidden sm:inline">Catálogo</span>
          </button>

          <button
            onClick={() => setShowSalesModal(true)}
            className="relative flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-bold text-ink hover:bg-subtle transition shadow-xs cursor-pointer"
            title="Historial de ventas y comprobantes"
          >
            <FileText className="h-3.5 w-3.5 text-brand" />
            <span className="hidden sm:inline">Ventas</span>
            {sales.length > 0 && (
              <span className="rounded-pill bg-brand-soft px-1.5 py-0.2 text-[10px] font-bold text-brand">
                {sales.length}
              </span>
            )}
          </button>

          <button
            onClick={toggleFullscreen}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-ink-soft transition hover:bg-subtle cursor-pointer"
            title={isFullscreen ? 'Salir de pantalla completa' : 'Modo pantalla completa'}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          <button
            onClick={() => {
              void triggerSync();
            }}
            disabled={isSyncing || !isOnline}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-ink-soft transition hover:bg-subtle disabled:opacity-50 cursor-pointer"
            title="Sincronizar con ERP"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin text-brand' : ''}`} />
          </button>

          <button
            onClick={() => setShowMobileMenu(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-ink transition hover:bg-subtle cursor-pointer"
            title="Opciones del sistema"
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>
      </header>

      {syncStatusMessage && (
        <div className="bg-brand/10 border-b border-brand/20 px-4 py-2 text-xs font-semibold text-brand flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{syncStatusMessage}</span>
          </div>
          <button
            onClick={() => void triggerSync()}
            disabled={isSyncing}
            className="underline hover:text-brand-ink text-[11px] cursor-pointer"
          >
            Reintentar sincronización
          </button>
        </div>
      )}

      <main className="relative flex flex-1 flex-col lg:flex-row overflow-hidden">
        <section className="flex flex-1 flex-col p-3 sm:p-5 overflow-hidden">
          <div className="relative mb-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                ref={searchInputRef}
                type="text"
                data-barcode-receiver="true"
                placeholder="Escanear con pistola USB / teclear SKU o Nombre (Enter agrega)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="w-full rounded-2xl border border-line bg-surface py-3 pl-10 pr-4 text-xs sm:text-sm font-medium text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand shadow-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted hover:text-ink cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <button
              onClick={() => setShowCameraModal(true)}
              className="flex h-11 items-center gap-1.5 rounded-2xl border border-line bg-surface px-3.5 text-xs font-bold text-ink hover:bg-subtle transition shadow-xs cursor-pointer"
              title="Escanear con cámara (Móvil / Tablet)"
            >
              <Camera className="h-4 w-4 text-brand" />
              <span className="hidden md:inline">Cámara (Móvil)</span>
            </button>

            <button
              onClick={() => setShowVariosModal(true)}
              className="flex h-11 items-center gap-1.5 rounded-2xl border border-brand-line bg-brand-soft px-3.5 text-xs font-bold text-brand hover:bg-brand-soft/80 transition shadow-xs cursor-pointer"
              title="Agregar ítem varios fuera de catálogo"
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden md:inline">+ Varios</span>
            </button>
          </div>

          {searchQuery.trim().length > 0 && searchResults.length > 0 && (
            <div className="absolute top-16 left-3 right-3 lg:right-[400px] z-20 max-h-64 overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-2xl space-y-1">
              <div className="px-2 py-1 text-[11px] font-bold text-muted uppercase">
                Resultados coincidentes ({searchResults.length}) — Enter agrega el primero
              </div>
              {searchResults.slice(0, 8).map((prod) => (
                <button
                  key={prod.id}
                  onClick={() => {
                    addToCart(prod);
                    setSearchQuery('');
                  }}
                  className="flex w-full items-center justify-between rounded-xl p-2.5 text-left hover:bg-subtle transition cursor-pointer"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-brand">{prod.sku}</span>
                      <span className="text-xs font-bold text-ink">{prod.name}</span>
                    </div>
                    {prod.barcode && (
                      <span className="font-mono text-[10px] text-muted">
                        Barcode: {prod.barcode}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-sm font-black text-ink">
                      ${parseFloat(prod.price).toFixed(2)}
                    </span>
                    <span className="block font-mono text-[10px] text-muted">
                      Bs. {(parseFloat(prod.price) * rateNum).toFixed(2)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between border-b border-line pb-2 mb-2">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-brand" />
              <h2 className="text-sm font-bold text-ink">Ticket en Curso</h2>
              {totalItemCount > 0 && (
                <span className="rounded-pill bg-brand-soft px-2 py-0.5 text-[11px] font-extrabold text-brand">
                  {totalItemCount} {totalItemCount === 1 ? 'ítem' : 'ítems'}
                </span>
              )}
            </div>

            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs font-bold text-muted hover:text-danger transition cursor-pointer"
              >
                Vaciar Ticket
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center text-muted">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-canvas">
                  <ShoppingCart className="h-7 w-7 text-muted/60" />
                </div>
                <p className="mt-3 text-sm font-bold text-ink">Terminal de Venta Lista</p>
                <p className="mt-1 text-xs text-muted max-w-sm">
                  Escaneá códigos con tu lector, buscá por SKU/nombre arriba o tocá en Catálogo para
                  agregar productos.
                </p>
                <button
                  onClick={() => setShowCatalogDrawer(true)}
                  className="mt-4 rounded-xl border border-line bg-surface px-4 py-2 text-xs font-bold text-brand shadow-xs hover:bg-subtle cursor-pointer"
                >
                  Abrir Catálogo Visual
                </button>
              </div>
            ) : (
              cart.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center justify-between rounded-2xl border border-line bg-surface p-3 hover:border-line-strong transition shadow-xs"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate text-xs sm:text-sm font-bold text-ink">
                        {line.name}
                      </h4>
                      {line.sku && (
                        <span className="rounded-md bg-subtle px-1.5 py-0.2 font-mono text-[10px] font-bold text-muted">
                          {line.sku}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-mono text-muted">
                      ${(Number(line.unitPriceMinor) / 100).toFixed(2)} | Bs.{' '}
                      {((Number(line.unitPriceMinor) / 100) * rateNum).toFixed(2)} c/u
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => updateCartQuantity(line.id, line.quantity - 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-canvas text-ink transition hover:bg-subtle active:scale-95 cursor-pointer"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-7 text-center font-mono text-xs font-bold text-ink">
                      {line.quantity}
                    </span>
                    <button
                      onClick={() => updateCartQuantity(line.id, line.quantity + 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-canvas text-ink transition hover:bg-subtle active:scale-95 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>

                    <div className="ml-2 w-20 text-right">
                      <span className="font-mono text-xs sm:text-sm font-black text-ink">
                        ${(Number(line.lineTotalMinor) / 100).toFixed(2)}
                      </span>
                      <span className="block font-mono text-[10px] text-muted">
                        Bs. {((Number(line.lineTotalMinor) / 100) * rateNum).toFixed(2)}
                      </span>
                    </div>

                    <button
                      onClick={() => removeFromCart(line.id)}
                      className="ml-2 p-1.5 text-muted transition hover:text-danger cursor-pointer"
                      title="Eliminar artículo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="w-full lg:w-96 shrink-0 flex flex-col border-t lg:border-t-0 lg:border-l border-line bg-surface shadow-xs">
          <div className="p-4 border-b border-line bg-canvas/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-brand" />
                Facturación Fiscal
              </span>
              <span className="text-[10px] font-bold text-brand bg-brand-soft px-2 py-0.5 rounded-pill">
                Se verifica al cobrar
              </span>
            </div>

            <div className="rounded-xl border border-dashed border-line bg-surface p-2.5 shadow-xs text-xs text-muted">
              {selectedCustomer ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-ink">{selectedCustomer.name}</p>
                    <p className="font-mono text-[11px] text-muted">{selectedCustomer.taxId}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="text-xs font-bold text-danger hover:underline cursor-pointer"
                  >
                    Quitar
                  </button>
                </div>
              ) : (
                <div>
                  <p className="font-semibold text-ink">Sin cliente asignado</p>
                  <p className="text-[11px] text-muted">
                    Se seleccionará o registrará al momento de cobrar.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 p-4 flex flex-col justify-between">
            {!currentShift && (
              <div className="mb-3 rounded-2xl border border-warn/40 bg-warn-soft p-3.5 text-xs text-warn-ink shadow-xs">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warn-ink mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold">Caja cerrada</p>
                    <p className="mt-0.5 text-muted">
                      Para cobrar ventas, abrí el turno indicando el fondo de efectivo.
                    </p>
                    <button
                      onClick={() => setShowOpenShiftModal(true)}
                      className="mt-2 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 cursor-pointer"
                    >
                      Abrir Turno Ahora
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2 text-xs text-muted">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-mono text-ink">
                  ${(Number(totals.subtotalMinor) / 100).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>IVA estimado (16%)</span>
                <span className="font-mono text-ink">
                  ${(Number(totals.taxMinor) / 100).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Tasa Oficial BCV</span>
                <span className="font-mono text-brand font-bold">Bs. {activeExchangeRate}</span>
              </div>

              <div className="border-t border-line pt-3 mt-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-base font-extrabold text-ink">Total a Cobrar</span>
                  <div className="text-right">
                    <span className="font-mono text-2xl font-black text-brand">
                      ${totalDecimal.toFixed(2)}
                    </span>
                    <div className="font-mono text-xs font-bold text-ink">
                      ≈ Bs. {totalVesDecimal.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-line/60">
              <button
                disabled={cart.length === 0 || !currentShift}
                onClick={() => handleOpenCheckoutModal('usd')}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 text-sm font-black text-white shadow-md transition hover:bg-emerald-700 active:scale-98 disabled:opacity-40 cursor-pointer"
              >
                <Banknote className="h-5 w-5" />
                <span>COBRAR TICKET (F4)</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      {showCatalogDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
          <div className="w-full sm:max-w-xl h-full border-l border-line bg-surface p-4 sm:p-6 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-brand" />
                <h3 className="text-base font-bold text-ink">Catálogo de Productos</h3>
              </div>
              <button
                onClick={() => setShowCatalogDrawer(false)}
                className="rounded-xl p-1.5 text-muted hover:bg-subtle cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex rounded-xl border border-line bg-canvas p-0.5 shadow-xs">
                <button
                  onClick={() => setCatalogFilterMode('all')}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition cursor-pointer ${
                    catalogFilterMode === 'all'
                      ? 'bg-brand text-white shadow-xs'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setCatalogFilterMode('in_stock')}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition cursor-pointer ${
                    catalogFilterMode === 'in_stock'
                      ? 'bg-brand text-white shadow-xs'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  Con stock
                </button>
              </div>

              <button
                onClick={() => {
                  void reloadDemoCatalog();
                }}
                className="text-xs font-bold text-brand hover:underline cursor-pointer"
              >
                Recargar Catálogo ERP
              </button>
            </div>

            <div className="mt-3 flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {displayedCatalog.map((product) => {
                  const isAvailable = parseFloat(product.onHand) > 0;
                  const qtyInCart = getCartQuantity(product.id);

                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className={`flex flex-col justify-between rounded-2xl border p-3 text-left transition duration-150 active:scale-97 cursor-pointer ${
                        qtyInCart > 0
                          ? 'border-brand bg-brand-soft/30 shadow-xs'
                          : 'border-line bg-surface hover:border-brand/50 hover:shadow-sm'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between pb-1.5">
                          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
                            {product.sku}
                          </span>
                          <span
                            className={`rounded-pill px-1.5 py-0.2 text-[9px] font-bold ${
                              isAvailable
                                ? 'bg-success-soft text-success-ink'
                                : 'bg-warn-soft text-warn-ink'
                            }`}
                          >
                            {isAvailable ? `${product.onHand} ${product.unit}` : 'Sin stock'}
                          </span>
                        </div>

                        <h3 className="line-clamp-2 text-xs font-bold text-ink">{product.name}</h3>
                      </div>

                      <div className="mt-2.5 flex items-baseline justify-between border-t border-line/60 pt-2">
                        <div className="flex flex-col text-left">
                          <span className="font-mono text-sm font-extrabold text-ink">
                            ${parseFloat(product.price).toFixed(2)}
                          </span>
                          <span className="font-mono text-[10px] text-muted font-semibold">
                            Bs. {(parseFloat(product.price) * rateNum).toFixed(2)}
                          </span>
                        </div>

                        {qtyInCart > 0 ? (
                          <span className="flex items-center gap-1 rounded-pill bg-brand px-1.5 py-0.5 text-[11px] font-extrabold text-white shadow-xs">
                            <Check className="h-3 w-3 stroke-[3]" />
                            {qtyInCart}
                          </span>
                        ) : (
                          <span className="flex h-6 w-6 items-center justify-center rounded-xl bg-brand-soft text-brand shadow-xs">
                            <Plus className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {showCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl border border-line bg-surface p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-brand" />
                <h3 className="text-base font-bold text-ink">Seleccionar o Registrar Cliente</h3>
              </div>
              <button
                onClick={() => setShowCustomerModal(false)}
                className="rounded-xl p-1.5 text-muted hover:bg-subtle cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 flex rounded-xl bg-subtle p-1 border border-line">
              <button
                type="button"
                onClick={() => setCustomerModalTab('search')}
                className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition cursor-pointer ${
                  customerModalTab === 'search'
                    ? 'bg-surface text-ink shadow-xs'
                    : 'text-muted hover:text-ink'
                }`}
              >
                Buscar en Base de Datos
              </button>
              <button
                type="button"
                onClick={() => setCustomerModalTab('create')}
                className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition cursor-pointer ${
                  customerModalTab === 'create'
                    ? 'bg-surface text-ink shadow-xs'
                    : 'text-muted hover:text-ink'
                }`}
              >
                + Registrar Nuevo Cliente
              </button>
            </div>

            {customerModalTab === 'search' ? (
              <div className="mt-4 flex-1 flex flex-col overflow-hidden">
                <div className="relative mb-3">
                  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    placeholder="Buscar por Nombre, C.I. o RIF..."
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    className="w-full rounded-2xl border border-line bg-canvas py-2.5 pl-10 pr-4 text-xs font-medium text-ink focus:border-brand focus:outline-none"
                  />
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {customerSearchResults.length === 0 ? (
                    <div className="p-4 text-center rounded-xl bg-surface border border-line/60">
                      <p className="text-xs text-muted">
                        {customerSearchQuery.trim()
                          ? `No hay clientes que coincidan con "${customerSearchQuery}".`
                          : 'No hay clientes registrados en la base de datos.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerModalTab('create');
                          setNewCustTaxId(customerSearchQuery.trim());
                        }}
                        className="mt-2 text-xs font-bold text-brand hover:underline cursor-pointer"
                      >
                        + Registrar nuevo cliente
                      </button>
                    </div>
                  ) : (
                    customerSearchResults.map((cust) => (
                      <button
                        key={cust.id}
                        onClick={() => {
                          setSelectedCustomer(cust);
                          setShowCustomerModal(false);
                        }}
                        className="w-full flex items-center justify-between rounded-xl border border-line bg-surface p-3 text-left hover:border-brand transition cursor-pointer"
                      >
                        <div>
                          <p className="text-xs font-bold text-ink">{cust.name}</p>
                          <p className="font-mono text-[11px] text-muted">
                            {cust.taxId} | {cust.code}
                          </p>
                        </div>
                        <span className="text-xs font-bold text-brand">Seleccionar</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-bold text-ink">Nombre o Razón Social *</label>
                  <input
                    type="text"
                    placeholder="Ej. Inversiones La Cascada C.A."
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-ink">C.I. / RIF / DNI *</label>
                  <input
                    type="text"
                    placeholder="Ej. J-12345678-9 o V-12345678"
                    value={newCustTaxId}
                    onChange={(e) => setNewCustTaxId(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-ink">Teléfono (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej. 0414-1234567"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
                  />
                </div>

                <div className="mt-4 flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setCustomerModalTab('search')}
                    className="rounded-xl px-4 py-2 text-xs font-bold text-muted hover:text-ink cursor-pointer"
                  >
                    Volver a Búsqueda
                  </button>
                  <button
                    disabled={!newCustName.trim() || !newCustTaxId.trim()}
                    onClick={() => {
                      void handleCreateAndSelectCustomer();
                    }}
                    className="rounded-2xl bg-brand px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-brand-hover disabled:opacity-40 cursor-pointer"
                  >
                    Guardar y Asignar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showSalesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-6">
          <div className="w-full max-w-4xl h-[90vh] rounded-3xl border border-line bg-surface p-4 sm:p-6 shadow-2xl flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-line">
              <div>
                <h3 className="text-base sm:text-lg font-black tracking-tight text-ink">
                  Historial de Ventas Emitidas
                </h3>
                <p className="text-xs text-muted">
                  Comprobantes fiscales digitales (Providencia SNAT/2026/00093)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="rounded-xl border border-line bg-canvas px-3 py-1.5 text-center shadow-xs">
                  <p className="text-[10px] font-bold text-muted uppercase">Total Facturado</p>
                  <p className="font-mono text-sm font-black text-brand">
                    ${totalSalesAmount.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-xl border border-success/30 bg-success-soft px-3 py-1.5 text-center shadow-xs">
                  <p className="text-[10px] font-bold text-success-ink uppercase">Sincronizadas</p>
                  <p className="font-mono text-sm font-black text-success-ink">
                    {syncedSalesCount}
                  </p>
                </div>
                {pendingSalesCount > 0 && (
                  <div className="rounded-xl border border-warn/30 bg-warn-soft px-3 py-1.5 text-center shadow-xs">
                    <p className="text-[10px] font-bold text-warn-ink uppercase">En Cola</p>
                    <p className="font-mono text-sm font-black text-warn-ink">
                      {pendingSalesCount}
                    </p>
                  </div>
                )}
                <button
                  onClick={() => {
                    void triggerSync();
                  }}
                  disabled={isSyncing}
                  className="flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs font-bold text-ink hover:bg-subtle transition cursor-pointer"
                  title="Sincronizar ventas con ERP"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 text-brand ${isSyncing ? 'animate-spin' : ''}`}
                  />
                  <span className="hidden sm:inline">Sincronizar</span>
                </button>
                <button
                  onClick={() => setShowSalesModal(false)}
                  className="rounded-xl p-1.5 text-muted hover:bg-subtle cursor-pointer ml-2"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pt-3 pr-1 space-y-2.5">
              {sales.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted">
                  <FileText className="h-12 w-12 stroke-1 text-muted/60" />
                  <p className="mt-3 text-sm font-bold text-ink">Sin ventas registradas aún</p>
                  <p className="mt-1 text-xs text-muted">
                    Cada venta emitida desde esta terminal quedará registrada aquí para consulta,
                    impresión y descarga.
                  </p>
                </div>
              ) : (
                sales.map((sale) => {
                  const isSynced = sale.syncStatus === 'synced';
                  const totalUsd = (Number(sale.totalMinor) / 100).toFixed(2);
                  const rate = parseFloat(sale.exchangeRateBcv || '36.50');
                  const totalVes = (parseFloat(totalUsd) * rate).toFixed(2);
                  const dateFormatted = new Date(sale.occurredAt).toLocaleString('es-VE', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={sale.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between rounded-2xl border border-line bg-canvas p-3.5 hover:border-line-strong transition shadow-xs gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 pb-1">
                          <span className="font-mono text-xs font-black text-brand">
                            {sale.ticketNumber}
                          </span>
                          <span className="font-mono text-[10px] text-muted">
                            Ctrl: {sale.invoiceControlNumber}
                          </span>
                          <span
                            className={`flex items-center gap-1 rounded-pill px-2 py-0.2 text-[9px] font-bold ${
                              isSynced
                                ? 'bg-success-soft text-success-ink'
                                : 'bg-warn-soft text-warn-ink'
                            }`}
                          >
                            {isSynced ? (
                              <CheckCircle2 className="h-2.5 w-2.5" />
                            ) : (
                              <Clock className="h-2.5 w-2.5" />
                            )}
                            {isSynced ? 'Sincronizada con ERP' : 'En cola (Offline)'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 text-xs text-ink font-medium">
                          <span>{sale.customerName}</span>
                          <span className="font-mono text-muted text-[11px]">
                            {sale.customerDoc}
                          </span>
                          <span className="text-muted text-[11px]">{dateFormatted}</span>
                          <span className="rounded-md bg-subtle px-1.5 py-0.2 text-[10px] font-bold text-muted uppercase">
                            {sale.paymentMethod}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 border-line/60 pt-2 sm:pt-0">
                        <div className="text-left sm:text-right">
                          <p className="font-mono text-base font-black text-ink">${totalUsd}</p>
                          <p className="font-mono text-[11px] text-muted">Bs. {totalVes}</p>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setSelectedSaleDetail(sale)}
                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:bg-subtle transition cursor-pointer"
                            title="Ver detalle"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => printInvoice(sale)}
                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:bg-subtle transition cursor-pointer"
                            title="Imprimir ticket fiscal (SENIAT 00093)"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => downloadInvoiceFile(sale)}
                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:bg-subtle transition cursor-pointer"
                            title="Descargar comprobante digital"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {showCashCheckoutModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border border-line bg-surface p-5 sm:p-6 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-line/60 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <Banknote className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink">Cobro y Facturación</h3>
                  <p className="text-[11px] text-muted">Seleccioná cliente y forma de pago</p>
                </div>
              </div>
              <button
                onClick={() => setShowCashCheckoutModal(false)}
                className="rounded-xl p-1.5 text-muted hover:bg-subtle cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 my-3">
              <div className="rounded-2xl border border-line bg-canvas/70 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-muted uppercase">
                      Total a Cobrar
                    </span>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="font-mono text-2xl font-black text-brand">
                        ${totalDecimal.toFixed(2)}
                      </span>
                      <span className="text-xs text-muted font-bold">≈</span>
                      <span className="font-mono text-base font-bold text-ink">
                        Bs. {totalVesDecimal.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center">
                    {isEditingRateInCheckout ? (
                      <div className="flex items-center gap-1.5 rounded-xl border border-brand bg-surface p-1 shadow-xs">
                        <span className="text-[11px] font-bold text-muted pl-1">Bs.</span>
                        <input
                          type="number"
                          step="0.01"
                          value={checkoutNewRateInput}
                          onChange={(e) => setCheckoutNewRateInput(e.target.value)}
                          className="w-20 rounded-lg border border-line bg-canvas px-2 py-0.5 font-mono text-xs font-bold text-ink focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              !checkoutNewRateInput.trim() ||
                              parseFloat(checkoutNewRateInput) <= 0
                            )
                              return;
                            void updateShiftExchangeRate(checkoutNewRateInput, 'Ajuste en cobro');
                            setIsEditingRateInCheckout(false);
                          }}
                          className="rounded-lg bg-brand px-2 py-1 text-[10px] font-bold text-white hover:bg-brand-hover cursor-pointer"
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingRateInCheckout(false);
                            setCheckoutNewRateInput(activeExchangeRate);
                          }}
                          className="rounded-lg px-1.5 py-1 text-[10px] text-muted hover:text-ink cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setCheckoutNewRateInput(activeExchangeRate);
                          setIsEditingRateInCheckout(true);
                        }}
                        className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 py-1 text-xs font-bold text-ink hover:border-brand/40 transition shadow-2xs cursor-pointer"
                        title="Haz clic para actualizar la tasa oficial BCV si cambió"
                      >
                        <TrendingUp className="h-3.5 w-3.5 text-brand" />
                        <span className="font-mono text-xs">Tasa Bs. {activeExchangeRate}</span>
                        <Pencil className="h-3 w-3 text-muted" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-line bg-canvas/50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
                    <User className="h-4 w-4 text-brand" />
                    <span>Cliente para Factura</span>
                  </div>
                  {selectedCustomer ? (
                    <span className="flex items-center gap-1 rounded-pill bg-success-soft px-2 py-0.5 text-[10px] font-bold text-success-ink">
                      <CheckCircle2 className="h-3 w-3" />
                      Seleccionado
                    </span>
                  ) : (
                    <span className="rounded-pill bg-warn-soft px-2 py-0.5 text-[10px] font-bold text-warn-ink uppercase">
                      Obligatorio
                    </span>
                  )}
                </div>

                {selectedCustomer ? (
                  <div className="flex items-center justify-between rounded-xl border border-emerald-600/40 bg-emerald-50/50 p-2.5 text-xs">
                    <div>
                      <p className="font-bold text-emerald-950">{selectedCustomer.name}</p>
                      <p className="font-mono text-[11px] text-emerald-800">
                        {selectedCustomer.taxId}{' '}
                        {selectedCustomer.code ? `• ${selectedCustomer.code}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomer(null);
                        setIsCreatingCustomerInCheckout(false);
                        setCheckoutCustomerSearch('');
                      }}
                      className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-bold text-ink hover:bg-subtle transition cursor-pointer"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : isCreatingCustomerInCheckout ? (
                  <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
                    <div className="flex items-center justify-between pb-1">
                      <span className="text-xs font-bold text-ink">Registrar Nuevo Cliente</span>
                      <button
                        type="button"
                        onClick={() => setIsCreatingCustomerInCheckout(false)}
                        className="text-xs font-semibold text-muted hover:text-ink cursor-pointer"
                      >
                        Volver a buscar
                      </button>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-muted uppercase">
                        C.I. / RIF (DNI) *
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. V-18765432 o J-12345678"
                        value={newCustTaxId}
                        onChange={(e) => setNewCustTaxId(e.target.value)}
                        className="mt-0.5 w-full rounded-xl border border-line bg-canvas px-2.5 py-1.5 font-mono text-xs font-bold text-ink focus:border-brand focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-muted uppercase">
                        Nombre o Razón Social *
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. María Pérez o Abasto Central C.A."
                        value={newCustName}
                        onChange={(e) => setNewCustName(e.target.value)}
                        className="mt-0.5 w-full rounded-xl border border-line bg-canvas px-2.5 py-1.5 text-xs font-bold text-ink focus:border-brand focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-muted uppercase">
                        Teléfono (Opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. 0414-1234567"
                        value={newCustPhone}
                        onChange={(e) => setNewCustPhone(e.target.value)}
                        className="mt-0.5 w-full rounded-xl border border-line bg-canvas px-2.5 py-1.5 text-xs text-ink focus:border-brand focus:outline-none"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsCreatingCustomerInCheckout(false)}
                        className="rounded-xl px-3 py-1.5 text-xs font-bold text-muted hover:text-ink cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={!newCustName.trim() || !newCustTaxId.trim()}
                        onClick={() => {
                          void handleCreateCustomerInCheckout();
                        }}
                        className="rounded-xl bg-brand px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-brand-hover disabled:opacity-40 cursor-pointer"
                      >
                        Guardar y Asignar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                        <input
                          type="text"
                          placeholder="Buscar por Nombre o C.I./RIF..."
                          value={checkoutCustomerSearch}
                          onChange={(e) => setCheckoutCustomerSearch(e.target.value)}
                          className="w-full rounded-xl border border-line bg-surface py-1.5 pl-8 pr-3 text-xs font-medium text-ink focus:border-brand focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNewCustName('');
                          setNewCustTaxId(checkoutCustomerSearch.trim());
                          setNewCustPhone('');
                          setIsCreatingCustomerInCheckout(true);
                        }}
                        className="flex items-center gap-1 rounded-xl bg-brand-soft border border-brand/30 px-2.5 py-1.5 text-xs font-bold text-brand hover:bg-brand-soft/80 transition cursor-pointer shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Nuevo</span>
                      </button>
                    </div>

                    <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                      {checkoutCustomerList.length === 0 ? (
                        <div className="p-3 text-center rounded-xl bg-surface border border-line/60">
                          <p className="text-xs text-muted">
                            {checkoutCustomerSearch.trim()
                              ? `No hay clientes que coincidan con "${checkoutCustomerSearch}".`
                              : 'No hay clientes registrados.'}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setNewCustName('');
                              setNewCustTaxId(checkoutCustomerSearch.trim());
                              setNewCustPhone('');
                              setIsCreatingCustomerInCheckout(true);
                            }}
                            className="mt-1.5 text-xs font-bold text-brand hover:underline cursor-pointer"
                          >
                            + Registrar cliente ahora
                          </button>
                        </div>
                      ) : (
                        checkoutCustomerList.map((cust) => (
                          <button
                            key={cust.id}
                            type="button"
                            onClick={() => setSelectedCustomer(cust)}
                            className="w-full flex items-center justify-between rounded-xl border border-line bg-surface p-2 text-left hover:border-brand hover:bg-subtle transition cursor-pointer"
                          >
                            <div className="min-w-0 flex-1 pr-2">
                              <p className="text-xs font-bold text-ink truncate">{cust.name}</p>
                              <p className="font-mono text-[10px] text-muted">{cust.taxId}</p>
                            </div>
                            <span className="text-[11px] font-bold text-brand shrink-0">
                              Elegir
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold text-muted uppercase mb-1.5 block">
                  Forma de Pago
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCheckoutPaymentMethod('cash_usd');
                      if (!cashTenderedInput) setCashTenderedInput(totalDecimal.toFixed(2));
                    }}
                    className={`flex flex-col items-center justify-center rounded-xl border p-2 text-center transition cursor-pointer ${
                      checkoutPaymentMethod === 'cash_usd'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800 font-bold ring-2 ring-emerald-600'
                        : 'border-line bg-surface text-ink hover:bg-subtle'
                    }`}
                  >
                    <Banknote className="h-4 w-4 mb-0.5 text-emerald-600" />
                    <span className="text-xs font-bold">Efectivo ($)</span>
                    <span className="font-mono text-[10px] text-muted">
                      ${totalDecimal.toFixed(2)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCheckoutPaymentMethod('cash_ves');
                      if (!vesTenderedInput) setVesTenderedInput(totalVesDecimal.toFixed(2));
                    }}
                    className={`flex flex-col items-center justify-center rounded-xl border p-2 text-center transition cursor-pointer ${
                      checkoutPaymentMethod === 'cash_ves'
                        ? 'border-brand bg-brand-soft/40 text-brand font-bold ring-2 ring-brand'
                        : 'border-line bg-surface text-ink hover:bg-subtle'
                    }`}
                  >
                    <Coins className="h-4 w-4 mb-0.5 text-brand" />
                    <span className="text-xs font-bold">Efectivo (Bs.)</span>
                    <span className="font-mono text-[10px] text-muted">
                      Bs. {totalVesDecimal.toFixed(2)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCheckoutPaymentMethod('pago_movil')}
                    className={`flex flex-col items-center justify-center rounded-xl border p-2 text-center transition cursor-pointer ${
                      checkoutPaymentMethod === 'pago_movil'
                        ? 'border-brand bg-brand-soft/40 text-brand font-bold ring-2 ring-brand'
                        : 'border-line bg-surface text-ink hover:bg-subtle'
                    }`}
                  >
                    <Smartphone className="h-4 w-4 mb-0.5 text-brand" />
                    <span className="text-xs font-bold">Pago Móvil</span>
                    <span className="font-mono text-[10px] text-muted">
                      Bs. {totalVesDecimal.toFixed(2)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCheckoutPaymentMethod('punto_debito')}
                    className={`flex flex-col items-center justify-center rounded-xl border p-2 text-center transition cursor-pointer ${
                      checkoutPaymentMethod === 'punto_debito'
                        ? 'border-brand bg-brand-soft/40 text-brand font-bold ring-2 ring-brand'
                        : 'border-line bg-surface text-ink hover:bg-subtle'
                    }`}
                  >
                    <CreditCard className="h-4 w-4 mb-0.5 text-brand" />
                    <span className="text-xs font-bold">Punto Débito</span>
                    <span className="font-mono text-[10px] text-muted">
                      Bs. {totalVesDecimal.toFixed(2)}
                    </span>
                  </button>
                </div>
              </div>

              {checkoutPaymentMethod === 'cash_usd' && (
                <div className="space-y-2.5 rounded-2xl border border-line bg-surface p-3.5">
                  <div>
                    <label className="text-xs font-bold text-ink">
                      Monto recibido en Dólares ($)
                    </label>
                    <div className="relative mt-1">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-base font-bold text-muted">
                        $
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        value={cashTenderedInput}
                        onChange={(e) => setCashTenderedInput(e.target.value)}
                        className="w-full rounded-2xl border border-line bg-canvas py-2 pl-8 pr-3 font-mono text-lg font-black text-ink focus:border-brand focus:outline-none"
                      />
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {[totalDecimal, 5, 10, 20, 50, 100].map((amount) => {
                        if (amount < totalDecimal && amount !== totalDecimal) return null;
                        const label = amount === totalDecimal ? 'Exacto' : `$${amount.toFixed(0)}`;
                        return (
                          <button
                            key={amount}
                            type="button"
                            onClick={() => setCashTenderedInput(amount.toFixed(2))}
                            className="rounded-xl border border-line bg-subtle px-2.5 py-0.5 text-xs font-bold text-ink hover:bg-canvas transition cursor-pointer"
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-xl border border-line bg-canvas p-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-bold text-muted">Vuelto a entregar:</p>
                      <p className="text-[10px] font-mono text-muted">
                        ≈ Bs. {(changeValue * rateNum).toFixed(2)}
                      </p>
                    </div>
                    <span
                      className={`font-mono text-xl font-black ${
                        tenderedNumber >= totalDecimal ? 'text-emerald-600' : 'text-danger'
                      }`}
                    >
                      ${changeValue.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {checkoutPaymentMethod === 'cash_ves' && (
                <div className="space-y-2.5 rounded-2xl border border-line bg-surface p-3.5">
                  <div>
                    <label className="text-xs font-bold text-ink">
                      Monto recibido en Bolívares (Bs.)
                    </label>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-muted">
                        Bs.
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        value={vesTenderedInput}
                        onChange={(e) => setVesTenderedInput(e.target.value)}
                        className="w-full rounded-2xl border border-line bg-canvas py-2 pl-9 pr-3 font-mono text-lg font-black text-ink focus:border-brand focus:outline-none"
                      />
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setVesTenderedInput(totalVesDecimal.toFixed(2))}
                        className="rounded-xl border border-line bg-subtle px-2.5 py-0.5 text-xs font-bold text-ink hover:bg-canvas transition cursor-pointer"
                      >
                        Exacto (Bs. {totalVesDecimal.toFixed(2)})
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-line bg-canvas p-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-bold text-muted">Vuelto en Bolívares:</p>
                      <p className="text-[10px] font-mono text-muted">
                        ≈ ${(rateNum > 0 ? vesChangeValue / rateNum : 0).toFixed(2)} USD
                      </p>
                    </div>
                    <span
                      className={`font-mono text-xl font-black ${
                        vesTenderedNumber >= totalVesDecimal ? 'text-emerald-600' : 'text-danger'
                      }`}
                    >
                      Bs. {vesChangeValue.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {checkoutPaymentMethod === 'pago_movil' && (
                <div className="rounded-2xl border border-line bg-surface p-4 text-center space-y-1">
                  <p className="text-xs font-bold text-ink">Cobro por Pago Móvil Interbancario</p>
                  <p className="font-mono text-2xl font-black text-brand">
                    Bs. {totalVesDecimal.toFixed(2)}
                  </p>
                  <p className="text-xs font-mono text-muted">
                    Equivalente a ${totalDecimal.toFixed(2)} USD a Tasa BCV: {activeExchangeRate}
                  </p>
                </div>
              )}

              {checkoutPaymentMethod === 'punto_debito' && (
                <div className="rounded-2xl border border-line bg-surface p-4 text-center space-y-1">
                  <p className="text-xs font-bold text-ink">
                    Cobro por Punto de Venta (Tarjeta Débito)
                  </p>
                  <p className="font-mono text-2xl font-black text-brand">
                    Bs. {totalVesDecimal.toFixed(2)}
                  </p>
                  <p className="text-xs font-mono text-muted">
                    Equivalente a ${totalDecimal.toFixed(2)} USD a Tasa BCV: {activeExchangeRate}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-line/60 flex justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowCashCheckoutModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-muted hover:text-ink transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  !selectedCustomer ||
                  (checkoutPaymentMethod === 'cash_usd' && tenderedNumber < totalDecimal) ||
                  (checkoutPaymentMethod === 'cash_ves' && vesTenderedNumber < totalVesDecimal)
                }
                onClick={() => {
                  if (checkoutPaymentMethod === 'cash_usd') {
                    void handleCheckout('cash', `$${changeValue.toFixed(2)}`);
                  } else if (checkoutPaymentMethod === 'cash_ves') {
                    void handleCheckout('cash', `Bs. ${vesChangeValue.toFixed(2)}`);
                  } else if (checkoutPaymentMethod === 'pago_movil') {
                    void handleCheckout('transfer');
                  } else if (checkoutPaymentMethod === 'punto_debito') {
                    void handleCheckout('card');
                  }
                }}
                className={`rounded-2xl px-6 py-2.5 text-xs font-extrabold text-white shadow-xs transition disabled:opacity-40 cursor-pointer ${
                  checkoutPaymentMethod === 'cash_usd'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-brand hover:bg-brand-hover'
                }`}
              >
                {checkoutPaymentMethod === 'cash_usd' &&
                  `Confirmar Cobro ($${totalDecimal.toFixed(2)})`}
                {checkoutPaymentMethod === 'cash_ves' &&
                  `Confirmar Cobro (Bs. ${totalVesDecimal.toFixed(2)})`}
                {checkoutPaymentMethod === 'pago_movil' &&
                  `Confirmar Pago Móvil (Bs. ${totalVesDecimal.toFixed(2)})`}
                {checkoutPaymentMethod === 'punto_debito' &&
                  `Confirmar Punto Débito (Bs. ${totalVesDecimal.toFixed(2)})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showOpenShiftModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-line bg-surface p-6 shadow-xl">
            <div className="flex items-center gap-2.5 pb-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-success-soft text-success-ink">
                <Unlock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-ink">Apertura de Turno</h3>
                <p className="text-xs text-muted">Fondo inicial y tasa oficial para la jornada</p>
              </div>
            </div>

            <div className="mt-4 space-y-3.5">
              <div>
                <label className="text-xs font-bold text-ink">Fondo de Efectivo ($)</label>
                <div className="relative mt-1.5">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-base font-bold text-muted">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={initialFloatInput}
                    onChange={(e) => setInitialFloatInput(e.target.value)}
                    className="w-full rounded-2xl border border-line bg-surface py-2.5 pl-8 pr-3 font-mono text-lg font-bold text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>

                <div className="mt-2 flex gap-1.5">
                  {['20.00', '50.00', '100.00'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setInitialFloatInput(preset)}
                      className="flex-1 rounded-xl border border-line bg-subtle py-1.5 text-xs font-bold text-ink hover:bg-surface transition cursor-pointer"
                    >
                      ${preset}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-ink">
                    Tasa Oficial BCV (Bs/USD) <span className="text-danger">*</span>
                  </label>
                  <span className="text-[10px] text-brand font-semibold">Obligatoria</span>
                </div>
                <div className="relative mt-1.5">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-muted">
                    Bs.
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="36.50"
                    value={openShiftRateInput}
                    onChange={(e) => setOpenShiftRateInput(e.target.value)}
                    className="w-full rounded-2xl border border-line bg-surface py-2.5 pl-10 pr-3 font-mono text-base font-bold text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  Tasa con la que se abrirá el turno para conversiones y fiscalización.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                onClick={() => setShowOpenShiftModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-muted hover:text-ink transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                disabled={!openShiftRateInput || parseFloat(openShiftRateInput) <= 0}
                onClick={() => {
                  void handleOpenShift();
                }}
                className="rounded-2xl bg-brand px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-brand-hover transition disabled:opacity-40 cursor-pointer"
              >
                Abrir Caja
              </button>
            </div>
          </div>
        </div>
      )}

      {showCloseShiftModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-line bg-surface p-6 shadow-xl">
            <div className="flex items-center gap-2.5 pb-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-warn-soft text-warn-ink">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-ink">Arqueo Ciego y Cierre de Turno</h3>
                <p className="text-xs text-muted">Contá el efectivo en gaveta e ingresá el total</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-line bg-canvas/60 p-3 space-y-1 text-xs">
                <div className="flex justify-between text-muted">
                  <span>Tasa Apertura Turno:</span>
                  <span className="font-mono font-bold text-ink">
                    Bs. {currentShift?.openExchangeRateBcv ?? '36.50'}
                  </span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Tasa Cierre Turno:</span>
                  <span className="font-mono font-bold text-brand">Bs. {activeExchangeRate}</span>
                </div>
                {(currentShift?.rateAuditHistory?.length ?? 0) > 1 && (
                  <div className="pt-1 text-[11px] text-warn-ink font-medium">
                    ⚠️ Esta tasa fue modificada {currentShift!.rateAuditHistory!.length - 1} veces
                    durante la jornada.
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-ink">Efectivo en Gaveta ($)</label>
                <div className="relative mt-1.5">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-base font-bold text-muted">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={declaredCashInput}
                    onChange={(e) => setDeclaredCashInput(e.target.value)}
                    className="w-full rounded-2xl border border-line bg-surface py-2.5 pl-8 pr-3 font-mono text-lg font-bold text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                onClick={() => setShowCloseShiftModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-muted hover:text-ink transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  void handleCloseShift();
                }}
                className="rounded-2xl bg-brand px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-brand-hover transition cursor-pointer"
              >
                Cerrar y Conciliar
              </button>
            </div>
          </div>
        </div>
      )}

      {showRateModal && currentShift && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-line bg-surface p-6 shadow-xl">
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink">Ajuste de Tasa BCV</h3>
                  <p className="text-xs text-muted">Trazabilidad oficial durante el turno</p>
                </div>
              </div>
              <button
                onClick={() => setShowRateModal(false)}
                className="rounded-xl p-1.5 text-muted hover:bg-subtle cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-line bg-canvas/60 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted">Tasa de Apertura:</span>
                  <span className="font-mono font-bold text-ink">
                    Bs. {currentShift.openExchangeRateBcv}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Tasa Actual Vigente:</span>
                  <span className="font-mono font-bold text-brand">Bs. {activeExchangeRate}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-ink">
                  Nueva Tasa Oficial BCV (Bs/USD) <span className="text-danger">*</span>
                </label>
                <div className="relative mt-1.5">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-muted">
                    Bs.
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="36.50"
                    value={newRateInput}
                    onChange={(e) => setNewRateInput(e.target.value)}
                    className="w-full rounded-2xl border border-line bg-surface py-2.5 pl-10 pr-3 font-mono text-base font-bold text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-ink">Motivo del Ajuste (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ej. Publicación BCV 4:30 PM"
                  value={rateChangeReasonInput}
                  onChange={(e) => setRateChangeReasonInput(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
                />
              </div>

              {currentShift.rateAuditHistory && currentShift.rateAuditHistory.length > 0 && (
                <div className="mt-2 rounded-2xl border border-line/60 bg-subtle/50 p-2.5">
                  <p className="text-[10px] font-bold text-muted uppercase">Historial del Turno</p>
                  <div className="mt-1.5 max-h-24 overflow-y-auto space-y-1 text-[11px]">
                    {currentShift.rateAuditHistory.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-muted font-mono">
                        <span>
                          {new Date(item.changedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          - {item.reason ?? 'Ajuste'}
                        </span>
                        <span className="font-bold text-ink">Bs. {item.rate}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2.5">
              <button
                onClick={() => setShowRateModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-muted hover:text-ink transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                disabled={!newRateInput || parseFloat(newRateInput) <= 0}
                onClick={() => {
                  void handleUpdateRate();
                }}
                className="rounded-2xl bg-brand px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-brand-hover transition disabled:opacity-40 cursor-pointer"
              >
                Actualizar Tasa
              </button>
            </div>
          </div>
        </div>
      )}

      {showVariosModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-line bg-surface p-6 shadow-xl">
            <div className="flex items-center gap-2.5 pb-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-ink">Venta Varios (Contingente)</h3>
                <p className="text-xs text-muted">Artículo rápido no registrado en catálogo</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-ink">Nombre del Artículo</label>
                <input
                  type="text"
                  value={variosName}
                  onChange={(e) => setVariosName(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink">Precio de Venta ($)</label>
                <div className="relative mt-1.5">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm font-bold text-muted">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={variosPrice}
                    onChange={(e) => setVariosPrice(e.target.value)}
                    className="w-full rounded-2xl border border-line bg-surface py-2.5 pl-8 pr-3 font-mono text-base font-bold text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                onClick={() => setShowVariosModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-muted hover:text-ink transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddVarios}
                className="rounded-2xl bg-brand px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-brand-hover transition cursor-pointer"
              >
                Agregar al Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {showEnrollModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-line bg-surface p-6 shadow-xl">
            <div className="flex items-center gap-2.5 pb-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                <Barcode className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-ink">Vincular Terminal a Caja</h3>
                <p className="text-xs text-muted">
                  Ingresá el código de emparejamiento emitido por el ERP
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-ink">Código de Emparejamiento</label>
                <input
                  type="text"
                  placeholder="CAJA-01"
                  value={enrollPairingCode}
                  onChange={(e) => setEnrollPairingCode(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-sm uppercase text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink">Nombre del Dispositivo</label>
                <input
                  type="text"
                  value={enrollDeviceName}
                  onChange={(e) => setEnrollDeviceName(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                onClick={() => setShowEnrollModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-muted hover:text-ink transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  void handleEnroll();
                }}
                className="rounded-2xl bg-brand px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-brand-hover transition cursor-pointer"
              >
                Vincular Caja
              </button>
            </div>
          </div>
        </div>
      )}

      {showCameraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-bold text-ink">Escanear Código (Cámara Móvil)</h3>
              </div>
              <button
                onClick={() => setShowCameraModal(false)}
                className="rounded-xl p-1.5 text-muted hover:bg-subtle transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
              <video
                ref={videoRef}
                playsInline
                autoPlay
                muted
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-x-12 inset-y-8 rounded-xl border-2 border-dashed border-brand" />
            </div>
            <p className="mt-3 text-center text-xs text-muted">
              Apuntá la cámara al código. En PC con pistola de código de barras USB, escaneá directo
              sin abrir la cámara.
            </p>
          </div>
        </div>
      )}

      {showMobileMenu && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-line bg-surface p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3">
              <h3 className="text-base font-bold text-ink">Configuración de Terminal POS</h3>
              <button
                onClick={() => setShowMobileMenu(false)}
                className="rounded-xl p-1.5 text-muted hover:bg-subtle cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 space-y-2">
              <button
                onClick={() => {
                  setShowMobileMenu(false);
                  void triggerSync();
                }}
                disabled={isSyncing || !isOnline}
                className="flex w-full items-center justify-between rounded-2xl border border-line bg-canvas/50 p-3.5 text-xs font-bold text-ink hover:bg-subtle transition cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <RefreshCw className={`h-4 w-4 text-brand ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>Sincronizar Catálogo y Ventas</span>
                </div>
                <span className="text-muted text-[11px] font-normal">
                  {pendingOutboxCount} pendientes
                </span>
              </button>

              <button
                onClick={() => {
                  setShowMobileMenu(false);
                  void reloadDemoCatalog();
                }}
                disabled={isSyncing}
                className="flex w-full items-center justify-between rounded-2xl border border-line bg-canvas/50 p-3.5 text-xs font-bold text-ink hover:bg-subtle transition cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles className="h-4 w-4 text-brand" />
                  <span>Cargar Catálogo Demo ERP</span>
                </div>
                <span className="text-muted text-[11px] font-normal">Semilla ERP</span>
              </button>

              {currentShift ? (
                <button
                  onClick={() => {
                    setShowMobileMenu(false);
                    setShowCloseShiftModal(true);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-2xl border border-line bg-canvas/50 p-3.5 text-xs font-bold text-ink hover:bg-subtle transition cursor-pointer"
                >
                  <Lock className="h-4 w-4 text-warn-ink" />
                  <span>Cerrar Turno y Realizar Arqueo</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    setShowMobileMenu(false);
                    setShowOpenShiftModal(true);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-2xl border border-line bg-canvas/50 p-3.5 text-xs font-bold text-ink hover:bg-subtle transition cursor-pointer"
                >
                  <Unlock className="h-4 w-4 text-success" />
                  <span>Abrir Turno de Caja</span>
                </button>
              )}

              <button
                onClick={() => {
                  setShowMobileMenu(false);
                  setShowEnrollModal(true);
                }}
                className="flex w-full items-center gap-2.5 rounded-2xl border border-line bg-canvas/50 p-3.5 text-xs font-bold text-ink hover:bg-subtle transition cursor-pointer"
              >
                <Barcode className="h-4 w-4 text-brand" />
                <span>Vincular Código de Caja ({registerCode ?? 'Ninguna'})</span>
              </button>

              <a
                href="/"
                className="flex w-full items-center gap-2.5 rounded-2xl border border-line bg-canvas/50 p-3.5 text-xs font-bold text-ink hover:bg-subtle transition"
              >
                <ArrowLeft className="h-4 w-4 text-muted" />
                <span>Volver al Panel ERP CoreBiz</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {lastSaleSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success-soft text-success-ink">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h3 className="mt-3 text-lg font-bold text-ink">¡Venta Exitosa!</h3>
            <p className="mt-0.5 text-xs text-muted">Ticket N°: {lastSaleSuccess.ticketNumber}</p>
            <p className="mt-2 font-mono text-3xl font-black text-brand">
              ${lastSaleSuccess.total}
            </p>

            {lastSaleSuccess.change && (
              <div className="mt-2.5 rounded-xl bg-emerald-50 py-1.5 text-xs font-bold text-emerald-800">
                Vuelto entregado: {lastSaleSuccess.change}
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                onClick={() => printInvoice(lastSaleSuccess.sale)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-canvas py-2.5 text-xs font-bold text-ink hover:bg-subtle transition cursor-pointer"
              >
                <Printer className="h-4 w-4 text-brand" />
                Imprimir
              </button>
              <button
                onClick={() => downloadInvoiceFile(lastSaleSuccess.sale)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-canvas py-2.5 text-xs font-bold text-ink hover:bg-subtle transition cursor-pointer"
              >
                <Download className="h-4 w-4 text-brand" />
                Descargar
              </button>
            </div>

            <button
              onClick={() => setLastSaleSuccess(null)}
              className="mt-3 w-full rounded-2xl bg-brand py-3 text-xs font-bold text-white shadow-xs transition hover:bg-brand-hover active:scale-98 cursor-pointer"
            >
              Siguiente Venta
            </button>
          </div>
        </div>
      )}

      {selectedSaleDetail && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-line bg-surface p-6 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div>
                <h3 className="text-base font-bold text-ink">Detalle de Factura</h3>
                <p className="font-mono text-xs font-bold text-brand">
                  {selectedSaleDetail.ticketNumber} | Ctrl:{' '}
                  {selectedSaleDetail.invoiceControlNumber}
                </p>
              </div>
              <button
                onClick={() => setSelectedSaleDetail(null)}
                className="rounded-xl p-1.5 text-muted hover:bg-subtle cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 space-y-3 overflow-y-auto flex-1 pr-1 text-xs">
              <div className="rounded-xl border border-line bg-canvas p-3 space-y-1">
                <div className="flex justify-between text-muted">
                  <span>Cliente:</span>
                  <span className="font-bold text-ink">{selectedSaleDetail.customerName}</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>C.I. / RIF:</span>
                  <span className="font-mono text-ink">{selectedSaleDetail.customerDoc}</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Fecha:</span>
                  <span className="text-ink">
                    {new Date(selectedSaleDetail.occurredAt).toLocaleString('es-VE')}
                  </span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Método de Pago:</span>
                  <span className="font-bold text-ink uppercase">
                    {selectedSaleDetail.paymentMethod}
                  </span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Estado ERP:</span>
                  <span
                    className={`font-bold ${
                      selectedSaleDetail.syncStatus === 'synced'
                        ? 'text-emerald-600'
                        : 'text-amber-600'
                    }`}
                  >
                    {selectedSaleDetail.syncStatus === 'synced'
                      ? 'Sincronizada con ERP'
                      : 'En cola local (Pendiente)'}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-ink pb-1">Artículos facturados</h4>
                <div className="space-y-1.5">
                  {selectedSaleDetail.lines.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-xl border border-line bg-canvas/40 p-2.5"
                    >
                      <div>
                        <p className="font-bold text-ink">{item.name}</p>
                        <p className="font-mono text-[11px] text-muted">
                          {item.quantity}x ${(Number(item.unitPriceMinor) / 100).toFixed(2)}
                        </p>
                      </div>
                      <span className="font-mono font-bold text-ink">
                        ${(Number(item.lineTotalMinor) / 100).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-line bg-canvas p-3 space-y-1">
                <div className="flex justify-between text-muted">
                  <span>Subtotal:</span>
                  <span className="font-mono text-ink">
                    ${(Number(selectedSaleDetail.subtotalMinor) / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>IVA (16%):</span>
                  <span className="font-mono text-ink">
                    ${(Number(selectedSaleDetail.taxMinor) / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-base font-black text-ink border-t border-line/60 pt-1">
                  <span>Total USD:</span>
                  <span className="font-mono text-brand">
                    ${(Number(selectedSaleDetail.totalMinor) / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted">
                  <span>Total Bs. (Tasa {selectedSaleDetail.exchangeRateBcv}):</span>
                  <span className="font-mono font-bold text-ink">
                    Bs.{' '}
                    {(
                      (Number(selectedSaleDetail.totalMinor) / 100) *
                      parseFloat(selectedSaleDetail.exchangeRateBcv || '36.50')
                    ).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2 pt-2 border-t border-line">
              <button
                onClick={() => printInvoice(selectedSaleDetail)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-canvas py-2.5 text-xs font-bold text-ink hover:bg-subtle transition cursor-pointer"
              >
                <Printer className="h-4 w-4 text-brand" />
                Imprimir
              </button>
              <button
                onClick={() => downloadInvoiceFile(selectedSaleDetail)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-canvas py-2.5 text-xs font-bold text-ink hover:bg-subtle transition cursor-pointer"
              >
                <Download className="h-4 w-4 text-brand" />
                Descargar
              </button>
            </div>
          </div>
        </div>
      )}

      {shiftReconciliationResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              <AlertTriangle className="h-8 w-8 text-brand" />
            </div>
            <h3 className="mt-3 text-base font-bold text-ink">Arqueo de Turno Finalizado</h3>
            <p className="mt-1 text-xs text-muted">
              Resultado de la conciliación a ciegas contra el sistema:
            </p>

            <div className="mt-4 rounded-2xl border border-line bg-canvas p-4 text-xs space-y-2">
              <div className="flex justify-between py-1 text-ink-soft">
                <span>Efectivo Contado Declarado:</span>
                <span className="font-mono font-bold text-ink">
                  ${shiftReconciliationResult.declared}
                </span>
              </div>
              <div className="flex justify-between border-t border-line/60 pt-2 text-ink-soft">
                <span>Diferencia / Desvío:</span>
                <span
                  className={`font-mono font-bold ${
                    parseFloat(shiftReconciliationResult.variance) === 0
                      ? 'text-ink'
                      : parseFloat(shiftReconciliationResult.variance) > 0
                        ? 'text-success-ink'
                        : 'text-danger-ink'
                  }`}
                >
                  ${shiftReconciliationResult.variance}
                </span>
              </div>
              <div className="flex justify-between border-t border-line/60 pt-2 text-ink-soft">
                <span>Tasa BCV Apertura:</span>
                <span className="font-mono font-bold text-ink">
                  Bs. {shiftReconciliationResult.openRate}
                </span>
              </div>
              <div className="flex justify-between text-ink-soft">
                <span>Tasa BCV Cierre:</span>
                <span className="font-mono font-bold text-brand">
                  Bs. {shiftReconciliationResult.closeRate}
                </span>
              </div>
              {shiftReconciliationResult.rateHistoryCount > 1 && (
                <div className="border-t border-line/60 pt-1 text-[11px] text-warn-ink font-semibold">
                  Trazabilidad: {shiftReconciliationResult.rateHistoryCount - 1} ajuste(s) de tasa
                  durante la jornada.
                </div>
              )}
            </div>

            <button
              onClick={() => setShiftReconciliationResult(null)}
              className="mt-6 w-full rounded-2xl bg-brand py-3 text-xs font-bold text-white shadow-xs transition hover:bg-brand-hover active:scale-98 cursor-pointer"
            >
              Aceptar y Continuar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
