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
  ChevronRight,
  ReceiptText,
  Banknote,
  Check,
} from 'lucide-react';
import { usePos } from './use-pos';
import { detectBarcodeFromMedia, generateInternalBarcode } from './barcode';
import type { LocalProduct } from './db';

export function App() {
  const {
    isOnline,
    pendingOutboxCount,
    currentShift,
    cart,
    registerCode,
    isSyncing,
    totals,
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
  } = usePos();

  const [activeTab, setActiveTab] = useState<'catalog' | 'cart'>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'in_stock'>('all');
  const [searchResults, setSearchResults] = useState<LocalProduct[]>([]);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [showVariosModal, setShowVariosModal] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showCashCheckoutModal, setShowCashCheckoutModal] = useState(false);

  const [initialFloatInput, setInitialFloatInput] = useState('50.00');
  const [declaredCashInput, setDeclaredCashInput] = useState('');
  const [cashTenderedInput, setCashTenderedInput] = useState('');
  const [variosName, setVariosName] = useState('Artículo Varios');
  const [variosPrice, setVariosPrice] = useState('10.00');
  const [enrollPairingCode, setEnrollPairingCode] = useState('CAJA-01');
  const [enrollDeviceName, setEnrollDeviceName] = useState('Terminal Móvil');

  const [lastSaleSuccess, setLastSaleSuccess] = useState<{
    readonly ticketNumber: string;
    readonly total: string;
    readonly change?: string | undefined;
  } | null>(null);

  const [shiftReconciliationResult, setShiftReconciliationResult] = useState<{
    readonly declared: string;
    readonly variance: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    void (async () => {
      const results = await searchCatalog(searchQuery);
      setSearchResults(results);
    })();
  }, [searchQuery, searchCatalog, isSyncing]);

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
    await openShift(minor);
    setShowOpenShiftModal(false);
  };

  const handleCloseShift = async () => {
    const minor = Math.round(parseFloat(declaredCashInput || '0') * 100).toString();
    const res = await closeShift(minor);
    if (res) {
      setShiftReconciliationResult({
        declared: (parseFloat(res.declaredCashMinor) / 100).toFixed(2),
        variance: (parseFloat(res.varianceMinor) / 100).toFixed(2),
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

  const handleCheckout = async (method: 'cash' | 'card' | 'transfer', changeAmount?: string) => {
    const res = await checkoutSale(method);
    if (res) {
      setLastSaleSuccess({
        ticketNumber: res.ticketNumber,
        total: (Number(res.totalMinor) / 100).toFixed(2),
        change: changeAmount,
      });
      setActiveTab('catalog');
    }
  };

  const totalDecimal = Number(totals.totalMinor) / 100;
  const totalItemCount = cart.reduce((acc, l) => acc + l.quantity, 0);

  const displayedProducts = searchResults.filter((p) => {
    if (filterMode === 'in_stock') {
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

  return (
    <div className="flex h-screen w-screen flex-col bg-canvas font-sans text-ink antialiased">
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-line bg-surface px-4 sm:px-6 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand font-black text-white shadow-xs">
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
                  <span className="rounded-pill bg-brand-soft px-1.5 py-0.2 text-[10px] font-bold text-brand">
                    {pendingOutboxCount} pend.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 rounded-2xl bg-subtle p-1 border border-line md:flex">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
              activeTab === 'catalog'
                ? 'bg-surface text-ink shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            <Package className="h-3.5 w-3.5 text-brand" />
            <span>Catálogo</span>
          </button>
          <button
            onClick={() => setActiveTab('cart')}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
              activeTab === 'cart' ? 'bg-surface text-ink shadow-xs' : 'text-muted hover:text-ink'
            }`}
          >
            <ReceiptText className="h-3.5 w-3.5 text-brand" />
            <span>Ticket</span>
            {totalItemCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-pill bg-brand px-1 text-[10px] font-bold text-white">
                {totalItemCount}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {currentShift ? (
            <button
              onClick={() => setShowCloseShiftModal(true)}
              className="hidden sm:flex items-center gap-1.5 rounded-xl border border-success/30 bg-success-soft px-3 py-1.5 text-xs font-bold text-success-ink transition hover:bg-success-soft/80"
              title="Turno abierto. Click para cerrar y arquear."
            >
              <Unlock className="h-3.5 w-3.5 text-success" />
              <span>
                Caja Abierta (${(parseFloat(currentShift.initialFloatMinor) / 100).toFixed(0)})
              </span>
            </button>
          ) : (
            <button
              onClick={() => setShowOpenShiftModal(true)}
              className="hidden sm:flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Abrir Turno</span>
            </button>
          )}

          <button
            onClick={() => {
              void triggerSync();
            }}
            disabled={isSyncing || !isOnline}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-ink-soft transition hover:bg-subtle disabled:opacity-50"
            title="Sincronizar datos"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin text-brand' : ''}`} />
          </button>

          <button
            onClick={() => setShowMobileMenu(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-ink transition hover:bg-subtle"
            title="Menú de opciones"
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="relative flex flex-1 overflow-hidden">
        <section
          className={`flex-1 flex-col p-4 sm:p-6 overflow-hidden ${
            activeTab === 'catalog' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2.5 pb-3.5">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar producto o escanear..."
                data-barcode-receiver
                className="w-full rounded-2xl border border-line bg-surface py-2.5 pl-10 pr-9 text-sm text-ink placeholder:text-muted shadow-xs transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <button
              onClick={() => setShowCameraModal(true)}
              className="flex items-center gap-1.5 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-xs font-bold text-ink shadow-xs transition hover:bg-subtle active:scale-95"
            >
              <Camera className="h-4 w-4 text-brand" />
              <span className="hidden sm:inline">Cámara</span>
            </button>

            <button
              onClick={() => setShowVariosModal(true)}
              className="flex items-center gap-1.5 rounded-2xl border border-brand-line bg-brand-soft px-3.5 py-2.5 text-xs font-bold text-brand shadow-xs transition hover:bg-brand-soft/80 active:scale-95"
            >
              <Sparkles className="h-4 w-4 text-brand" />
              <span>+ Varios</span>
            </button>
          </div>

          <div className="flex items-center gap-2 pb-3.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setFilterMode('all')}
              className={`rounded-pill px-3.5 py-1 text-xs font-bold whitespace-nowrap transition ${
                filterMode === 'all'
                  ? 'bg-brand text-white shadow-xs'
                  : 'bg-surface text-ink-soft border border-line hover:bg-subtle'
              }`}
            >
              Todos ({searchResults.length})
            </button>
            <button
              onClick={() => setFilterMode('in_stock')}
              className={`rounded-pill px-3.5 py-1 text-xs font-bold whitespace-nowrap transition ${
                filterMode === 'in_stock'
                  ? 'bg-brand text-white shadow-xs'
                  : 'bg-surface text-ink-soft border border-line hover:bg-subtle'
              }`}
            >
              Con Stock
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-0.5 pb-20 lg:pb-2">
            {displayedProducts.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {displayedProducts.map((product) => {
                  const qtyInCart = getCartQuantity(product.id);
                  const isAvailable = parseFloat(product.onHand) > 0;

                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className={`group relative flex flex-col justify-between rounded-2xl border bg-surface p-3.5 text-left shadow-xs transition active:scale-[0.97] cursor-pointer ${
                        qtyInCart > 0
                          ? 'border-brand ring-2 ring-brand/10 shadow-sm'
                          : 'border-line hover:border-brand-line hover:shadow-md'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 pb-2">
                          <span className="font-mono text-[10px] font-bold uppercase text-muted">
                            {product.sku}
                          </span>
                          <span
                            className={`rounded-pill px-2 py-0.5 text-[10px] font-bold ${
                              isAvailable
                                ? 'bg-success-soft text-success-ink'
                                : 'bg-warn-soft text-warn-ink'
                            }`}
                          >
                            {isAvailable ? `${product.onHand} ${product.unit}` : 'Sin stock'}
                          </span>
                        </div>

                        <h3 className="line-clamp-2 text-sm font-bold text-ink group-hover:text-brand transition">
                          {product.name}
                        </h3>
                      </div>

                      <div className="mt-3 flex items-baseline justify-between border-t border-line/60 pt-2.5">
                        <span className="font-mono text-base font-extrabold text-ink">
                          ${parseFloat(product.price).toFixed(2)}
                        </span>

                        {qtyInCart > 0 ? (
                          <span className="flex items-center gap-1 rounded-pill bg-brand px-2 py-0.5 text-xs font-extrabold text-white shadow-xs">
                            <Check className="h-3 w-3 stroke-[3]" />
                            {qtyInCart}
                          </span>
                        ) : (
                          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-brand-soft text-brand group-hover:bg-brand group-hover:text-white transition shadow-xs">
                            <Plus className="h-4 w-4" />
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface/40 p-8 text-center text-muted">
                <Package className="h-12 w-12 stroke-1 text-muted/60" />
                <p className="mt-3 text-sm font-bold text-ink">
                  {searchQuery ? 'No encontramos coincidencias' : 'Catálogo listo'}
                </p>
                <p className="mt-1 max-w-xs text-xs text-muted">
                  {searchQuery
                    ? 'Probá buscando por otro término o agregá un artículo fuera de catálogo.'
                    : 'Podés buscar por nombre, escanear o ingresar artículos varios.'}
                </p>
                <button
                  onClick={() => setShowVariosModal(true)}
                  className="mt-4 rounded-xl border border-brand-line bg-brand-soft px-4 py-2 text-xs font-bold text-brand transition hover:bg-brand-soft/80"
                >
                  + Agregar Artículo Varios
                </button>
              </div>
            )}
          </div>
        </section>

        {activeTab === 'catalog' && totalItemCount > 0 && (
          <div className="lg:hidden fixed bottom-4 inset-x-4 z-20">
            <button
              onClick={() => setActiveTab('cart')}
              className="flex w-full items-center justify-between rounded-2xl bg-brand px-5 py-3.5 text-white shadow-lg shadow-brand/25 transition active:scale-98 cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 font-bold">
                  {totalItemCount}
                </div>
                <div className="text-left">
                  <p className="text-xs text-brand-soft">Ver Ticket Actual</p>
                  <p className="text-sm font-extrabold">${totalDecimal.toFixed(2)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-sm font-bold">
                <span>Cobrar</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </button>
          </div>
        )}

        <section
          className={`w-full lg:w-96 shrink-0 flex-col border-l border-line bg-surface shadow-sm ${
            activeTab === 'cart' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-4 bg-canvas/30">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-brand" />
              <h2 className="text-sm font-bold text-ink">Ticket de Venta</h2>
              {totalItemCount > 0 && (
                <span className="rounded-pill bg-brand-soft px-2 py-0.5 text-[11px] font-extrabold text-brand">
                  {totalItemCount} {totalItemCount === 1 ? 'ítem' : 'ítems'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveTab('catalog')}
                className="lg:hidden text-xs font-bold text-brand"
              >
                + Productos
              </button>
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-xs font-semibold text-muted transition hover:text-danger"
                >
                  Vaciar
                </button>
              )}
            </div>
          </div>

          {!currentShift && (
            <div className="mx-4 mt-3 rounded-2xl border border-warn/40 bg-warn-soft p-3.5 text-xs text-warn-ink shadow-xs">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warn-ink mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold">Caja cerrada</p>
                  <p className="mt-0.5 text-muted">
                    Para cobrar ventas, abrí el turno indicando tu fondo de efectivo.
                  </p>
                  <button
                    onClick={() => setShowOpenShiftModal(true)}
                    className="mt-2.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700"
                  >
                    Abrir Turno Ahora
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center text-muted">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-canvas">
                  <ShoppingCart className="h-7 w-7 text-muted/60" />
                </div>
                <p className="mt-3 text-sm font-bold text-ink">Ticket en blanco</p>
                <p className="mt-1 text-xs text-muted max-w-[200px]">
                  Tocá los productos del catálogo o usá el lector de código de barras.
                </p>
                <button
                  onClick={() => setActiveTab('catalog')}
                  className="mt-4 rounded-xl border border-line bg-surface px-4 py-2 text-xs font-bold text-brand shadow-xs hover:bg-subtle"
                >
                  Explorar Catálogo
                </button>
              </div>
            ) : (
              cart.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center justify-between rounded-2xl border border-line bg-canvas/40 p-3 hover:border-line-strong transition shadow-xs"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <h4 className="truncate text-xs font-bold text-ink">{line.name}</h4>
                    <p className="text-[11px] font-mono text-muted">
                      ${(Number(line.unitPriceMinor) / 100).toFixed(2)} c/u
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => updateCartQuantity(line.id, line.quantity - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-xl border border-line bg-surface text-ink transition hover:bg-subtle active:scale-95 cursor-pointer"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center font-mono text-xs font-bold text-ink">
                      {line.quantity}
                    </span>
                    <button
                      onClick={() => updateCartQuantity(line.id, line.quantity + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-xl border border-line bg-surface text-ink transition hover:bg-subtle active:scale-95 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>

                    <span className="ml-2 w-16 text-right font-mono text-xs font-black text-ink">
                      ${(Number(line.lineTotalMinor) / 100).toFixed(2)}
                    </span>

                    <button
                      onClick={() => removeFromCart(line.id)}
                      className="ml-1 p-1 text-muted transition hover:text-danger cursor-pointer"
                      title="Eliminar artículo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-line bg-surface p-4 sm:p-5 shadow-xs">
            <div className="space-y-1.5 pb-4 text-xs text-muted">
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
              <div className="flex justify-between border-t border-line pt-2 text-xl font-black text-ink">
                <span>Total a Cobrar</span>
                <span className="font-mono text-brand">${totalDecimal.toFixed(2)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                disabled={cart.length === 0 || !currentShift}
                onClick={() => {
                  setCashTenderedInput(totalDecimal.toFixed(2));
                  setShowCashCheckoutModal(true);
                }}
                className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-xs font-extrabold text-white shadow-xs transition hover:bg-emerald-700 active:scale-98 disabled:opacity-40 cursor-pointer"
              >
                <Coins className="h-4 w-4" />
                Efectivo
              </button>

              <button
                disabled={cart.length === 0 || !currentShift}
                onClick={() => {
                  void handleCheckout('card');
                }}
                className="flex items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 text-xs font-extrabold text-white shadow-xs transition hover:bg-brand-hover active:scale-98 disabled:opacity-40 cursor-pointer"
              >
                <CreditCard className="h-4 w-4" />
                Tarjeta / Pago
              </button>
            </div>
          </div>
        </section>
      </main>

      {showCashCheckoutModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-line bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <Banknote className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink">Cobro en Efectivo</h3>
                  <p className="text-xs text-muted">Total a pagar: ${totalDecimal.toFixed(2)}</p>
                </div>
              </div>
              <button
                onClick={() => setShowCashCheckoutModal(false)}
                className="rounded-xl p-1.5 text-muted hover:bg-subtle"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4">
              <label className="text-xs font-bold text-ink">Monto recibido del cliente ($)</label>
              <div className="relative mt-1.5">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-lg font-bold text-muted">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={cashTenderedInput}
                  onChange={(e) => setCashTenderedInput(e.target.value)}
                  className="w-full rounded-2xl border border-line bg-surface py-3 pl-9 pr-4 font-mono text-xl font-black text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {[totalDecimal, 10, 20, 50, 100].map((amount) => {
                  if (amount < totalDecimal && amount !== totalDecimal) return null;
                  const label = amount === totalDecimal ? 'Exacto' : `$${amount.toFixed(0)}`;
                  return (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setCashTenderedInput(amount.toFixed(2))}
                      className="rounded-pill border border-line bg-subtle px-3 py-1.5 text-xs font-bold text-ink hover:bg-line transition"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {tenderedNumber >= totalDecimal && (
                <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-50/60 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-900">Vuelto a entregar:</span>
                    <span className="font-mono text-2xl font-black text-emerald-700">
                      ${changeValue.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                onClick={() => setShowCashCheckoutModal(false)}
                className="rounded-xl px-4 py-2.5 text-xs font-bold text-muted hover:text-ink transition"
              >
                Cancelar
              </button>
              <button
                disabled={tenderedNumber < totalDecimal}
                onClick={() => {
                  setShowCashCheckoutModal(false);
                  void handleCheckout('cash', changeValue > 0 ? changeValue.toFixed(2) : undefined);
                }}
                className="rounded-2xl bg-emerald-600 px-6 py-2.5 text-xs font-extrabold text-white shadow-xs hover:bg-emerald-700 transition disabled:opacity-50"
              >
                Confirmar y Emitir Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {showMobileMenu && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl border border-line bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-white font-bold text-xs">
                  CB
                </div>
                <h3 className="text-sm font-bold text-ink">Terminal POS Móvil</h3>
              </div>
              <button
                onClick={() => setShowMobileMenu(false)}
                className="rounded-xl p-1 text-muted hover:bg-subtle"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <button
                onClick={() => {
                  setShowMobileMenu(false);
                  void triggerSync();
                }}
                disabled={isSyncing || !isOnline}
                className="flex w-full items-center justify-between rounded-2xl border border-line bg-canvas/50 p-3.5 text-xs font-bold text-ink hover:bg-subtle transition"
              >
                <div className="flex items-center gap-2.5">
                  <RefreshCw className={`h-4 w-4 text-brand ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>Sincronizar Catálogo y Ventas</span>
                </div>
                <span className="text-muted text-[11px] font-normal">
                  {pendingOutboxCount} pendientes
                </span>
              </button>

              {currentShift ? (
                <button
                  onClick={() => {
                    setShowMobileMenu(false);
                    setShowCloseShiftModal(true);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-2xl border border-line bg-canvas/50 p-3.5 text-xs font-bold text-ink hover:bg-subtle transition"
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
                  className="flex w-full items-center gap-2.5 rounded-2xl border border-line bg-canvas/50 p-3.5 text-xs font-bold text-ink hover:bg-subtle transition"
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
                className="flex w-full items-center gap-2.5 rounded-2xl border border-line bg-canvas/50 p-3.5 text-xs font-bold text-ink hover:bg-subtle transition"
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

      {showOpenShiftModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-line bg-surface p-6 shadow-xl">
            <div className="flex items-center gap-2.5 pb-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-success-soft text-success-ink">
                <Unlock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-ink">Apertura de Turno</h3>
                <p className="text-xs text-muted">Fondo inicial de cambio para la caja</p>
              </div>
            </div>

            <div className="mt-4">
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

              <div className="mt-2.5 flex gap-1.5">
                {['20.00', '50.00', '100.00'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setInitialFloatInput(preset)}
                    className="rounded-pill border border-line bg-subtle px-3 py-1.5 text-xs font-bold text-ink hover:bg-line transition"
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                onClick={() => setShowOpenShiftModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-muted hover:text-ink transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  void handleOpenShift();
                }}
                className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
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
                <h3 className="text-base font-bold text-ink">Arqueo a Ciegas (Cierre)</h3>
                <p className="text-xs text-muted">Contá el dinero físico de la caja</p>
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs font-bold text-ink">Efectivo Físico Contado ($)</label>
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

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                onClick={() => setShowCloseShiftModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-muted hover:text-ink transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  void handleCloseShift();
                }}
                className="rounded-2xl bg-brand px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-brand-hover transition"
              >
                Cerrar y Conciliar
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
                className="rounded-xl px-4 py-2 text-xs font-bold text-muted hover:text-ink transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddVarios}
                className="rounded-2xl bg-brand px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-brand-hover transition"
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
                <p className="text-xs text-muted">Código de emparejamiento de CoreBiz</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-ink">Código de Caja (Ej: CAJA-01)</label>
                <input
                  type="text"
                  value={enrollPairingCode}
                  onChange={(e) => setEnrollPairingCode(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-line bg-surface px-3.5 py-2.5 font-mono text-sm font-bold text-ink uppercase focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink">Nombre de este Dispositivo</label>
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
                className="rounded-xl px-4 py-2 text-xs font-bold text-muted hover:text-ink transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  void handleEnroll();
                }}
                className="rounded-2xl bg-brand px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-brand-hover transition"
              >
                Vincular Caja
              </button>
            </div>
          </div>
        </div>
      )}

      {showCameraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-bold text-ink">Escanear Código de Barras</h3>
              </div>
              <button
                onClick={() => setShowCameraModal(false)}
                className="rounded-xl p-1.5 text-muted hover:bg-subtle transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-x-12 inset-y-8 rounded-xl border-2 border-dashed border-brand" />
            </div>
            <p className="mt-3 text-center text-xs text-muted">
              Apuntá la cámara al código de barras del producto
            </p>
          </div>
        </div>
      )}

      {lastSaleSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-xs rounded-3xl border border-line bg-surface p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success-soft text-success-ink">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h3 className="mt-3 text-lg font-bold text-ink">¡Venta Exitosa!</h3>
            <p className="mt-0.5 text-xs text-muted">Ticket N°: {lastSaleSuccess.ticketNumber}</p>
            <p className="mt-3 font-mono text-3xl font-black text-brand">
              ${lastSaleSuccess.total}
            </p>

            {lastSaleSuccess.change && (
              <div className="mt-2.5 rounded-xl bg-emerald-50 py-1.5 text-xs font-bold text-emerald-800">
                Vuelto entregado: ${lastSaleSuccess.change}
              </div>
            )}

            <button
              onClick={() => setLastSaleSuccess(null)}
              className="mt-6 w-full rounded-2xl bg-brand py-3 text-xs font-bold text-white shadow-xs transition hover:bg-brand-hover active:scale-98 cursor-pointer"
            >
              Siguiente Venta
            </button>
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

            <div className="mt-4 rounded-2xl border border-line bg-canvas p-4 text-xs">
              <div className="flex justify-between py-1 text-ink-soft">
                <span>Efectivo Contado Declarado:</span>
                <span className="font-mono font-bold text-ink">
                  ${shiftReconciliationResult.declared}
                </span>
              </div>
              <div className="flex justify-between border-t border-line py-1 pt-2 text-ink-soft">
                <span>Diferencia de Caja:</span>
                <span
                  className={`font-mono font-bold ${
                    parseFloat(shiftReconciliationResult.variance) === 0
                      ? 'text-success-ink'
                      : 'text-danger-ink'
                  }`}
                >
                  ${shiftReconciliationResult.variance}
                </span>
              </div>
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
