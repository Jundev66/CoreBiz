import { useState, useRef, useEffect } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  ShoppingCart,
  Barcode,
  Plus,
  Minus,
  Trash2,
  DollarSign,
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

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'in_stock'>('all');
  const [searchResults, setSearchResults] = useState<LocalProduct[]>([]);
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [showVariosModal, setShowVariosModal] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);

  const [initialFloatInput, setInitialFloatInput] = useState('50.00');
  const [declaredCashInput, setDeclaredCashInput] = useState('');
  const [variosName, setVariosName] = useState('Artículo Varios');
  const [variosPrice, setVariosPrice] = useState('10.00');
  const [enrollPairingCode, setEnrollPairingCode] = useState('CAJA-01');
  const [enrollDeviceName, setEnrollDeviceName] = useState('Mostrador Principal');

  const [lastSaleSuccess, setLastSaleSuccess] = useState<{
    readonly ticketNumber: string;
    readonly total: string;
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

  const handleCheckout = async (method: 'cash' | 'card' | 'transfer') => {
    const res = await checkoutSale(method);
    if (res) {
      setLastSaleSuccess({
        ticketNumber: res.ticketNumber,
        total: (Number(res.totalMinor) / 100).toFixed(2),
      });
    }
  };

  const displayedProducts = searchResults.filter((p) => {
    if (filterMode === 'in_stock') {
      return parseFloat(p.onHand) > 0;
    }
    return true;
  });

  return (
    <div className="flex h-screen w-screen flex-col bg-canvas font-sans text-ink antialiased">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-surface px-6 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-control bg-brand font-bold text-white shadow-xs">
              CB
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight text-ink">CoreBiz POS</h1>
                <span className="rounded-pill border border-line bg-subtle px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                  {registerCode ? `Caja: ${registerCode}` : 'Sin Vincular'}
                </span>
              </div>
              <p className="text-xs text-muted">Terminal de Venta Offline-First</p>
            </div>
          </div>

          <div className="h-6 w-px bg-line" />

          {currentShift ? (
            <div className="flex items-center gap-2 rounded-pill border border-success/40 bg-success-soft px-3 py-1 text-xs font-semibold text-success-ink">
              <Unlock className="h-3.5 w-3.5" />
              Turno Abierto · Fondo: $
              {(parseFloat(currentShift.initialFloatMinor) / 100).toFixed(2)}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-pill border border-warn/40 bg-warn-soft px-3 py-1 text-xs font-semibold text-warn-ink">
              <Lock className="h-3.5 w-3.5" />
              Caja Cerrada
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isOnline ? (
            <span className="flex items-center gap-1.5 rounded-pill border border-success/30 bg-success-soft px-3 py-1 text-xs font-medium text-success-ink">
              <Wifi className="h-3.5 w-3.5 text-success" /> En línea
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-pill border border-danger/40 bg-danger-soft px-3 py-1 text-xs font-semibold text-danger-ink animate-pulse">
              <WifiOff className="h-3.5 w-3.5 text-danger" /> Modo Offline
            </span>
          )}

          {pendingOutboxCount > 0 && (
            <span className="flex items-center gap-1 rounded-pill border border-brand-line bg-brand-soft px-3 py-1 text-xs font-bold text-brand">
              <RefreshCw className="h-3 w-3 animate-spin" />
              {pendingOutboxCount} por sincronizar
            </span>
          )}

          <button
            onClick={() => {
              void triggerSync();
            }}
            disabled={isSyncing || !isOnline}
            className="flex h-9 w-9 items-center justify-center rounded-control border border-line bg-surface text-ink-soft transition hover:bg-subtle hover:text-ink disabled:opacity-50"
            title="Sincronizar catálogo y ventas"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin text-brand' : ''}`} />
          </button>

          {!registerCode && (
            <button
              onClick={() => setShowEnrollModal(true)}
              className="rounded-control bg-brand px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-brand-hover"
            >
              Vincular Caja
            </button>
          )}

          {currentShift ? (
            <button
              onClick={() => setShowCloseShiftModal(true)}
              className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-subtle"
            >
              Cerrar Turno (Arqueo)
            </button>
          ) : (
            <button
              onClick={() => setShowOpenShiftModal(true)}
              className="rounded-control bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700"
            >
              Abrir Turno
            </button>
          )}

          <a
            href="/"
            className="flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-subtle"
            title="Ir al panel de gestión ERP"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-muted" />
            Panel ERP
          </a>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <section className="flex flex-1 flex-col p-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
            <div className="relative min-w-[280px] flex-1 max-w-xl">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, SKU o código de barras (F2)..."
                data-barcode-receiver
                className="w-full rounded-control border border-line bg-surface py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-muted transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand shadow-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCameraModal(true)}
                className="flex items-center gap-2 rounded-control border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-ink transition hover:bg-subtle shadow-xs"
              >
                <Camera className="h-4 w-4 text-brand" />
                Escanear Cámara
              </button>

              <button
                onClick={() => setShowVariosModal(true)}
                className="flex items-center gap-2 rounded-control border border-brand-line bg-brand-soft px-3.5 py-2 text-xs font-semibold text-brand transition hover:bg-brand-soft/80 shadow-xs"
              >
                <Sparkles className="h-4 w-4 text-brand" />
                Venta Varios (+ Fuera Catálogo)
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 pb-4">
            <button
              onClick={() => setFilterMode('all')}
              className={`rounded-pill px-3 py-1 text-xs font-semibold transition ${
                filterMode === 'all'
                  ? 'bg-brand text-white shadow-xs'
                  : 'bg-surface text-ink-soft border border-line hover:bg-subtle'
              }`}
            >
              Todos los productos ({searchResults.length})
            </button>
            <button
              onClick={() => setFilterMode('in_stock')}
              className={`rounded-pill px-3 py-1 text-xs font-semibold transition ${
                filterMode === 'in_stock'
                  ? 'bg-brand text-white shadow-xs'
                  : 'bg-surface text-ink-soft border border-line hover:bg-subtle'
              }`}
            >
              Con Stock Disponible
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-1">
            {displayedProducts.length > 0 ? (
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
                {displayedProducts.map((product) => {
                  const stockNumber = parseFloat(product.onHand);
                  const isAvailable = stockNumber > 0;

                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="group flex flex-col justify-between rounded-card border border-line bg-surface p-4 text-left shadow-xs transition hover:border-brand-line hover:shadow-md cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 pb-1.5">
                          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
                            {product.sku}
                          </span>
                          <span
                            className={`rounded-pill px-2 py-0.5 text-[10px] font-semibold ${
                              isAvailable
                                ? 'bg-success-soft text-success-ink'
                                : 'bg-warn-soft text-warn-ink'
                            }`}
                          >
                            {isAvailable ? `${product.onHand} ${product.unit}` : 'Sin stock'}
                          </span>
                        </div>
                        <h3 className="line-clamp-2 text-sm font-semibold text-ink group-hover:text-brand transition">
                          {product.name}
                        </h3>
                      </div>

                      <div className="mt-4 flex items-baseline justify-between border-t border-line/60 pt-2.5">
                        <span className="text-lg font-bold text-ink">
                          ${parseFloat(product.price).toFixed(2)}
                        </span>
                        <span className="flex h-7 w-7 items-center justify-center rounded-control bg-brand-soft text-brand group-hover:bg-brand group-hover:text-white transition shadow-xs">
                          <Plus className="h-4 w-4" />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-card border border-dashed border-line bg-surface/50 p-12 text-center text-muted">
                <Package className="h-12 w-12 stroke-1 text-muted" />
                <p className="mt-3 text-sm font-semibold text-ink">
                  {searchQuery ? 'No encontramos productos coincidentes' : 'Catálogo disponible'}
                </p>
                <p className="mt-1 max-w-sm text-xs text-muted">
                  {searchQuery
                    ? 'Revisá la ortografía o creá un ítem con Venta Varios.'
                    : 'Podés buscar por nombre, ingresar un código de barras o conectar una pistola lectora HID.'}
                </p>
                <button
                  onClick={() => setShowVariosModal(true)}
                  className="mt-4 rounded-control border border-brand-line bg-brand-soft px-4 py-2 text-xs font-semibold text-brand transition hover:bg-brand-soft/80"
                >
                  Agregar Artículo Varios
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="flex w-96 shrink-0 flex-col border-l border-line bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-line px-5 py-4 bg-canvas/30">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-brand" />
              <h2 className="text-sm font-bold text-ink">Ticket de Venta</h2>
              {cart.length > 0 && (
                <span className="rounded-pill bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand">
                  {cart.reduce((acc, l) => acc + l.quantity, 0)}
                </span>
              )}
            </div>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs font-semibold text-muted transition hover:text-danger"
              >
                Vaciar
              </button>
            )}
          </div>

          {!currentShift && (
            <div className="mx-4 mt-4 rounded-card border border-warn/40 bg-warn-soft p-3 text-xs text-warn-ink">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warn-ink mt-0.5" />
                <div>
                  <p className="font-semibold">La caja está cerrada</p>
                  <p className="mt-0.5 text-muted">
                    Para registrar pagos y emitir tickets, abrí el turno de hoy.
                  </p>
                  <button
                    onClick={() => setShowOpenShiftModal(true)}
                    className="mt-2 rounded-control bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700"
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
                <ShoppingCart className="h-10 w-10 stroke-1 text-muted/60" />
                <p className="mt-2 text-xs font-semibold text-ink">El carrito está vacío</p>
                <p className="mt-0.5 text-[11px] text-muted max-w-[200px]">
                  Tocá los productos del catálogo o escaneá un código de barras.
                </p>
              </div>
            ) : (
              cart.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center justify-between rounded-control border border-line bg-canvas/40 p-2.5 hover:border-line-strong transition"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <h4 className="truncate text-xs font-semibold text-ink">{line.name}</h4>
                    <p className="text-[11px] text-muted font-mono">
                      ${(Number(line.unitPriceMinor) / 100).toFixed(2)} c/u
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => updateCartQuantity(line.id, line.quantity - 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-control border border-line bg-surface text-ink transition hover:bg-subtle"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-5 text-center text-xs font-bold text-ink">
                      {line.quantity}
                    </span>
                    <button
                      onClick={() => updateCartQuantity(line.id, line.quantity + 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-control border border-line bg-surface text-ink transition hover:bg-subtle"
                    >
                      <Plus className="h-3 w-3" />
                    </button>

                    <span className="ml-2 w-14 text-right text-xs font-bold text-ink">
                      ${(Number(line.lineTotalMinor) / 100).toFixed(2)}
                    </span>

                    <button
                      onClick={() => removeFromCart(line.id)}
                      className="ml-1 p-1 text-muted transition hover:text-danger"
                      title="Eliminar artículo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-line bg-surface p-5 shadow-xs">
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
              <div className="flex justify-between border-t border-line pt-2 text-lg font-black text-ink">
                <span>Total</span>
                <span className="font-mono text-brand">
                  ${(Number(totals.totalMinor) / 100).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={cart.length === 0 || !currentShift}
                onClick={() => {
                  void handleCheckout('cash');
                }}
                className="flex items-center justify-center gap-2 rounded-control bg-emerald-600 py-3 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-40 cursor-pointer"
              >
                <DollarSign className="h-4 w-4" />
                Efectivo
              </button>

              <button
                disabled={cart.length === 0 || !currentShift}
                onClick={() => {
                  void handleCheckout('card');
                }}
                className="flex items-center justify-center gap-2 rounded-control bg-brand py-3 text-xs font-bold text-white shadow-xs transition hover:bg-brand-hover disabled:opacity-40 cursor-pointer"
              >
                <CreditCard className="h-4 w-4" />
                Tarjeta / Pago
              </button>
            </div>
          </div>
        </section>
      </main>

      {showOpenShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="w-96 rounded-card border border-line bg-surface p-6 shadow-xl">
            <div className="flex items-center gap-2 pb-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-control bg-success-soft text-success-ink">
                <Unlock className="h-4 w-4" />
              </div>
              <h3 className="text-base font-bold text-ink">Apertura de Turno</h3>
            </div>
            <p className="mt-1 text-xs text-muted">
              Indicá el fondo inicial de cambio en caja para comenzar a operar.
            </p>

            <div className="mt-4">
              <label className="text-xs font-semibold text-ink">Fondo Inicial ($)</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={initialFloatInput}
                  onChange={(e) => setInitialFloatInput(e.target.value)}
                  className="w-full rounded-control border border-line bg-surface py-2.5 pl-8 pr-3 text-base font-bold text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              <div className="mt-2 flex gap-1.5">
                {['20.00', '50.00', '100.00'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setInitialFloatInput(preset)}
                    className="rounded-pill border border-line bg-subtle px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-line transition"
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                onClick={() => setShowOpenShiftModal(false)}
                className="rounded-control px-4 py-2 text-xs font-semibold text-muted hover:text-ink transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  void handleOpenShift();
                }}
                className="rounded-control bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
              >
                Confirmar Apertura
              </button>
            </div>
          </div>
        </div>
      )}

      {showCloseShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="w-96 rounded-card border border-line bg-surface p-6 shadow-xl">
            <div className="flex items-center gap-2 pb-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-control bg-warn-soft text-warn-ink">
                <Lock className="h-4 w-4" />
              </div>
              <h3 className="text-base font-bold text-ink">Arqueo a Ciegas (Cierre)</h3>
            </div>
            <p className="mt-1 text-xs text-muted">
              Contá el dinero físico en la gaveta e ingresá el total real. El sistema calculará la
              diferencia automáticamente sin revelar el saldo teórico para evitar sesgos.
            </p>

            <div className="mt-4">
              <label className="text-xs font-semibold text-ink">Efectivo Físico Contado ($)</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={declaredCashInput}
                  onChange={(e) => setDeclaredCashInput(e.target.value)}
                  className="w-full rounded-control border border-line bg-surface py-2.5 pl-8 pr-3 text-base font-bold text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                onClick={() => setShowCloseShiftModal(false)}
                className="rounded-control px-4 py-2 text-xs font-semibold text-muted hover:text-ink transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  void handleCloseShift();
                }}
                className="rounded-control bg-brand px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-hover transition"
              >
                Cerrar Caja y Conciliar
              </button>
            </div>
          </div>
        </div>
      )}

      {showVariosModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="w-96 rounded-card border border-line bg-surface p-6 shadow-xl">
            <div className="flex items-center gap-2 pb-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-control bg-brand-soft text-brand">
                <Sparkles className="h-4 w-4" />
              </div>
              <h3 className="text-base font-bold text-ink">Venta Varios (Contingente)</h3>
            </div>
            <p className="mt-1 text-xs text-muted">
              Agregá un artículo no catalogado temporalmente para no detener la fila.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-ink">Descripción del Artículo</label>
                <input
                  type="text"
                  value={variosName}
                  onChange={(e) => setVariosName(e.target.value)}
                  className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink">Precio de Venta ($)</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={variosPrice}
                    onChange={(e) => setVariosPrice(e.target.value)}
                    className="w-full rounded-control border border-line bg-surface py-2 pl-8 pr-3 text-sm font-bold text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                onClick={() => setShowVariosModal(false)}
                className="rounded-control px-4 py-2 text-xs font-semibold text-muted hover:text-ink transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddVarios}
                className="rounded-control bg-brand px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-hover transition"
              >
                Agregar al Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {showEnrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="w-96 rounded-card border border-line bg-surface p-6 shadow-xl">
            <div className="flex items-center gap-2 pb-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-control bg-brand-soft text-brand">
                <Barcode className="h-4 w-4" />
              </div>
              <h3 className="text-base font-bold text-ink">Vincular Terminal a Caja</h3>
            </div>
            <p className="mt-1 text-xs text-muted">
              Ingresá el código de emparejamiento de la caja configurada en CoreBiz.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-ink">
                  Código de Caja (Ej: CAJA-01)
                </label>
                <input
                  type="text"
                  value={enrollPairingCode}
                  onChange={(e) => setEnrollPairingCode(e.target.value)}
                  className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm font-mono font-bold text-ink uppercase focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink">Nombre de este Dispositivo</label>
                <input
                  type="text"
                  value={enrollDeviceName}
                  onChange={(e) => setEnrollDeviceName(e.target.value)}
                  className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                onClick={() => setShowEnrollModal(false)}
                className="rounded-control px-4 py-2 text-xs font-semibold text-muted hover:text-ink transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  void handleEnroll();
                }}
                className="rounded-control bg-brand px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-hover transition"
              >
                Vincular Caja
              </button>
            </div>
          </div>
        </div>
      )}

      {showCameraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md overflow-hidden rounded-card border border-line bg-surface p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-bold text-ink">Escanear Código de Barras</h3>
              </div>
              <button
                onClick={() => setShowCameraModal(false)}
                className="rounded-control p-1 text-muted hover:bg-subtle hover:text-ink transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative aspect-video w-full overflow-hidden rounded-control bg-black">
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-x-12 inset-y-8 rounded-control border-2 border-dashed border-brand" />
            </div>
            <p className="mt-3 text-center text-xs text-muted">
              Apuntá la cámara al código de barras del producto
            </p>
          </div>
        </div>
      )}

      {lastSaleSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="w-80 rounded-card border border-line bg-surface p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-pill bg-success-soft text-success-ink">
              <CheckCircle2 className="h-7 w-7 text-success" />
            </div>
            <h3 className="mt-3 text-base font-bold text-ink">¡Venta Registrada con Éxito!</h3>
            <p className="mt-1 text-xs text-muted">Ticket N°: {lastSaleSuccess.ticketNumber}</p>
            <p className="mt-3 font-mono text-2xl font-black text-brand">
              ${lastSaleSuccess.total}
            </p>

            <button
              onClick={() => setLastSaleSuccess(null)}
              className="mt-6 w-full rounded-control bg-brand py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-brand-hover cursor-pointer"
            >
              Nueva Venta
            </button>
          </div>
        </div>
      )}

      {shiftReconciliationResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="w-96 rounded-card border border-line bg-surface p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-pill bg-brand-soft text-brand">
              <AlertTriangle className="h-7 w-7 text-brand" />
            </div>
            <h3 className="mt-3 text-base font-bold text-ink">Arqueo de Turno Finalizado</h3>
            <p className="mt-1 text-xs text-muted">
              Resultado de la conciliación a ciegas contra las ventas del sistema:
            </p>

            <div className="mt-4 rounded-control border border-line bg-canvas p-4 text-xs">
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
              className="mt-6 w-full rounded-control bg-brand py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-brand-hover cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
