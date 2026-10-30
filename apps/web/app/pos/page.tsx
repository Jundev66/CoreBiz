'use client';

import Link from 'next/link';
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
} from 'lucide-react';
import { usePos } from '../../src/pos/use-pos';
import { detectBarcodeFromMedia, generateInternalBarcode } from '../../src/pos/barcode';
import type { LocalProduct } from '../../src/pos/db';

export default function PosPage() {
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
  const [searchResults, setSearchResults] = useState<LocalProduct[]>([]);
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [showVariosModal, setShowVariosModal] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);

  const [initialFloatInput, setInitialFloatInput] = useState('50.00');
  const [declaredCashInput, setDeclaredCashInput] = useState('');
  const [variosName, setVariosName] = useState('Articulo Varios');
  const [variosPrice, setVariosPrice] = useState('10.00');
  const [enrollPairingCode, setEnrollPairingCode] = useState('POS-01');
  const [enrollDeviceName, setEnrollDeviceName] = useState('Mostrador Principal');

  const [lastSaleSuccess, setLastSaleSuccess] = useState<{
    ticketNumber: string;
    total: string;
  } | null>(null);

  const [shiftReconciliationResult, setShiftReconciliationResult] = useState<{
    declared: string;
    variance: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        const results = await searchCatalog(searchQuery);
        setSearchResults(results);
      })();
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, searchCatalog]);

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
    setVariosName('Articulo Varios');
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

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-950 font-sans text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/80 px-6 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 font-bold text-white shadow-lg shadow-indigo-500/30">
              CB
            </span>
            <div>
              <h1 className="text-base font-semibold leading-tight tracking-tight text-white">
                CoreBiz POS
              </h1>
              <p className="text-xs text-slate-400">Caja: {registerCode ?? 'Sin Vincular'}</p>
            </div>
          </div>

          <div className="h-6 w-px bg-slate-800" />

          {currentShift ? (
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
              <Unlock className="h-3.5 w-3.5" />
              Turno Abierto (${(parseFloat(currentShift.initialFloatMinor) / 100).toFixed(2)})
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
              <Lock className="h-3.5 w-3.5" />
              Caja Cerrada
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isOnline ? (
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/60 px-3 py-1 text-xs font-medium text-emerald-400">
              <Wifi className="h-3.5 w-3.5" /> En línea
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-950/60 px-3 py-1 text-xs font-medium text-rose-400 animate-pulse">
              <WifiOff className="h-3.5 w-3.5" /> Offline
            </span>
          )}

          {pendingOutboxCount > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-950/80 px-3 py-1 text-xs font-semibold text-indigo-300">
              {pendingOutboxCount} pendientes
            </span>
          )}

          <button
            onClick={() => {
              void triggerSync();
            }}
            disabled={isSyncing || !isOnline}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 transition hover:bg-slate-700 hover:text-white disabled:opacity-50"
            title="Sincronizar Outbox y Catalogo"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

          {!registerCode && (
            <button
              onClick={() => setShowEnrollModal(true)}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-md transition hover:bg-indigo-500"
            >
              Vincular Caja
            </button>
          )}

          {currentShift ? (
            <button
              onClick={() => setShowCloseShiftModal(true)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 hover:text-white"
            >
              Cerrar Turno (Arqueo)
            </button>
          ) : (
            <button
              onClick={() => setShowOpenShiftModal(true)}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-md transition hover:bg-emerald-500"
            >
              Abrir Turno
            </button>
          )}

          <Link
            href="/products"
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-700 hover:text-white"
            title="Volver al panel administrativo de CoreBiz ERP"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver al ERP
          </Link>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <section className="flex flex-1 flex-col border-r border-slate-800 bg-slate-900/40 p-6">
          <div className="flex items-center gap-3 pb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, SKU o código de barras (F2)..."
                data-barcode-receiver
                className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <button
              onClick={() => setShowCameraModal(true)}
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white"
            >
              <Camera className="h-4 w-4" />
              Escanear
            </button>

            <button
              onClick={() => setShowVariosModal(true)}
              className="flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2.5 text-xs font-semibold text-indigo-400 transition hover:bg-indigo-500/20"
            >
              <Barcode className="h-4 w-4" />
              Venta Varios
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-1">
            {searchResults.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {searchResults.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/90 p-4 text-left transition hover:border-indigo-500/50 hover:bg-slate-800/80 hover:shadow-lg"
                  >
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        {product.sku}
                      </span>
                      <h3 className="line-clamp-2 text-sm font-medium text-slate-200">
                        {product.name}
                      </h3>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between">
                      <span className="text-base font-bold text-white">
                        ${parseFloat(product.price).toFixed(2)}
                      </span>
                      <span className="text-xs text-slate-500">
                        Disp: {product.onHand} {product.unit}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center text-slate-500">
                <Barcode className="h-12 w-12 stroke-1 text-slate-600" />
                <p className="mt-3 text-sm">
                  Utiliza el lector de código de barras o escribe para buscar productos
                </p>
                <p className="text-xs text-slate-600">
                  Las pistolas lectoras HID funcionarán automáticamente en esta pantalla
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="flex w-96 shrink-0 flex-col bg-slate-900/90">
          <div className="flex items-center justify-between border-b border-slate-800 p-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-white">Ticket de Venta</h2>
            </div>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs text-slate-400 transition hover:text-rose-400"
              >
                Vaciar
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-slate-500">
                <ShoppingCart className="h-10 w-10 stroke-1 text-slate-700" />
                <p className="mt-2 text-xs">El carrito está vacío</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((line) => (
                  <div
                    key={line.id}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <h4 className="truncate text-xs font-medium text-slate-200">{line.name}</h4>
                      <p className="text-[11px] text-slate-400">
                        ${(Number(line.unitPriceMinor) / 100).toFixed(2)} c/u
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateCartQuantity(line.id, line.quantity - 1)}
                        className="flex h-6 w-6 items-center justify-center rounded bg-slate-800 text-slate-300 transition hover:bg-slate-700"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-5 text-center text-xs font-semibold text-white">
                        {line.quantity}
                      </span>
                      <button
                        onClick={() => updateCartQuantity(line.id, line.quantity + 1)}
                        className="flex h-6 w-6 items-center justify-center rounded bg-slate-800 text-slate-300 transition hover:bg-slate-700"
                      >
                        <Plus className="h-3 w-3" />
                      </button>

                      <span className="ml-2 w-14 text-right text-xs font-bold text-white">
                        ${(Number(line.lineTotalMinor) / 100).toFixed(2)}
                      </span>

                      <button
                        onClick={() => removeFromCart(line.id)}
                        className="ml-1 text-slate-500 transition hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-800 bg-slate-950 p-4">
            <div className="space-y-1.5 pb-4 text-xs text-slate-400">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>${(Number(totals.subtotalMinor) / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>IVA (16%)</span>
                <span>${(Number(totals.taxMinor) / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-800 pt-2 text-base font-bold text-white">
                <span>Total</span>
                <span>${(Number(totals.totalMinor) / 100).toFixed(2)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={cart.length === 0 || !currentShift}
                onClick={() => {
                  void handleCheckout('cash');
                }}
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500 disabled:opacity-50"
              >
                <DollarSign className="h-4 w-4" />
                Efectivo
              </button>

              <button
                disabled={cart.length === 0 || !currentShift}
                onClick={() => {
                  void handleCheckout('card');
                }}
                className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:opacity-50"
              >
                <CreditCard className="h-4 w-4" />
                Tarjeta / Transfer
              </button>
            </div>
          </div>
        </section>
      </main>

      {showOpenShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-96 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white">Apertura de Turno</h3>
            <p className="mt-1 text-xs text-slate-400">
              Indica el fondo inicial en caja para comenzar a operar.
            </p>

            <div className="mt-4">
              <label className="text-xs text-slate-300">Fondo Inicial ($)</label>
              <input
                type="number"
                step="0.01"
                value={initialFloatInput}
                onChange={(e) => setInitialFloatInput(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowOpenShiftModal(false)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  void handleOpenShift();
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                Confirmar Apertura
              </button>
            </div>
          </div>
        </div>
      )}

      {showCloseShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-96 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white">Arqueo a Ciegas (Cierre)</h3>
            <p className="mt-1 text-xs text-slate-400">
              Cuenta el dinero en gaveta e ingresa el importe real sin consultar el sistema.
            </p>

            <div className="mt-4">
              <label className="text-xs text-slate-300">Efectivo Físico Contado ($)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={declaredCashInput}
                onChange={(e) => setDeclaredCashInput(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowCloseShiftModal(false)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  void handleCloseShift();
                }}
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500"
              >
                Cerrar Caja
              </button>
            </div>
          </div>
        </div>
      )}

      {showVariosModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-96 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white">Venta Contingente (Varios)</h3>
            <p className="mt-1 text-xs text-slate-400">
              Vende un artículo no catalogado o temporal sin detener la operativa.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-slate-300">Descripción Temporal</label>
                <input
                  type="text"
                  value={variosName}
                  onChange={(e) => setVariosName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300">Precio de Venta ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={variosPrice}
                  onChange={(e) => setVariosPrice(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowVariosModal(false)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddVarios}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                Agregar al Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {showEnrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-96 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white">Vincular Dispositivo POS</h3>
            <p className="mt-1 text-xs text-slate-400">
              Ingresa el código de la caja física creada en el ERP para autorizar este navegador.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-slate-300">Código de Caja (Ej: POS-01)</label>
                <input
                  type="text"
                  value={enrollPairingCode}
                  onChange={(e) => setEnrollPairingCode(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300">Nombre del Dispositivo</label>
                <input
                  type="text"
                  value={enrollDeviceName}
                  onChange={(e) => setEnrollDeviceName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowEnrollModal(false)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  void handleEnroll();
                }}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                Vincular
              </button>
            </div>
          </div>
        </div>
      )}

      {showCameraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center justify-between pb-3">
              <h3 className="text-sm font-semibold text-white">Escanear Código de Barras</h3>
              <button
                onClick={() => setShowCameraModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-x-12 inset-y-8 rounded-lg border-2 border-dashed border-indigo-400/80" />
            </div>
            <p className="mt-3 text-center text-xs text-slate-400">
              Apunta la cámara al código de barras del producto
            </p>
          </div>
        </div>
      )}

      {lastSaleSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-80 rounded-2xl border border-emerald-500/30 bg-slate-900 p-6 text-center shadow-2xl">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
            <h3 className="mt-3 text-base font-bold text-white">¡Venta Registrada!</h3>
            <p className="mt-1 text-xs text-slate-400">Ticket: {lastSaleSuccess.ticketNumber}</p>
            <p className="mt-3 text-2xl font-black text-white">${lastSaleSuccess.total}</p>

            <button
              onClick={() => setLastSaleSuccess(null)}
              className="mt-6 w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
            >
              Nueva Venta
            </button>
          </div>
        </div>
      )}

      {shiftReconciliationResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-96 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center shadow-2xl">
            <AlertTriangle className="mx-auto h-12 w-12 text-amber-400" />
            <h3 className="mt-3 text-base font-bold text-white">Turno Cerrado</h3>
            <p className="mt-1 text-xs text-slate-400">Resultado del arqueo a ciegas:</p>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs">
              <div className="flex justify-between py-1 text-slate-400">
                <span>Efectivo Declarado:</span>
                <span className="font-semibold text-white">
                  ${shiftReconciliationResult.declared}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-800/80 py-1 pt-2 text-slate-400">
                <span>Diferencia / Descuadre:</span>
                <span
                  className={`font-bold ${
                    parseFloat(shiftReconciliationResult.variance) === 0
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
                >
                  ${shiftReconciliationResult.variance}
                </span>
              </div>
            </div>

            <button
              onClick={() => setShiftReconciliationResult(null)}
              className="mt-6 w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
