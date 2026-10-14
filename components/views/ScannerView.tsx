"use client";

import { useEffect, useRef, useState } from "react";
import {
  Barcode,
  CheckCircle2,
  AlertTriangle,
  Volume2,
  VolumeX,
  Truck,
  Clock,
  Sparkles,
  ShieldCheck,
  ArrowDownLeft,
  ArrowUpRight,
  ListPlus,
  Zap,
  CheckCheck,
  RotateCcw,
  ShieldAlert,
  X,
  Layers,
  Boxes,
  Puzzle,
  Package,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { appFetch } from "@/lib/api";
import { RouteGuard } from "@/components/auth/RouteGuard";

// Web Audio API Synthesizer (Zero external audio file dependencies)
function playSynthesizedBeep(type: "success" | "duplicate" | "error" | "rto" | "bulk" | "damage" | "unverified_rto") {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === "success") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1320, now + 0.08);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === "rto") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(659, now);
      osc.frequency.setValueAtTime(880, now + 0.08);
      osc.frequency.setValueAtTime(1046, now + 0.16);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === "damage") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(311.13, now + 0.12);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === "bulk") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.08);
      osc.frequency.setValueAtTime(783.99, now + 0.16);
      osc.frequency.setValueAtTime(1046.5, now + 0.24);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === "duplicate") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(440, now);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === "unverified_rto") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(440, now + 0.12);
      osc.frequency.setValueAtTime(330, now + 0.24);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, now);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.45);
    }
  } catch (e) {
    // AudioContext blocked
  }
}

export default function ScannerPage() {
  const [scanType, setScanType] = useState<"SINGLE" | "BULK">("SINGLE");
  const [mode, setMode] = useState<"OUTWARD" | "RTO_INWARD" | "DAMAGE_SCAN">("OUTWARD");
  const [awbInput, setAwbInput] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<any>(null);
  const [bulkResult, setBulkResult] = useState<any>(null);
  const [scannedList, setScannedList] = useState<any[]>([]);
  const [sessionStats, setSessionStats] = useState({
    total: 0,
    outwardScans: 0,
    rtoScans: 0,
    damageScans: 0,
    duplicates: 0,
  });

  // Damage Inspection & Combo SKU Selector Modal State
  const [damageModalOpen, setDamageModalOpen] = useState(false);
  const [damageLoading, setDamageLoading] = useState(false);
  const [damageSubmitting, setDamageSubmitting] = useState(false);
  const [damageDetails, setDamageDetails] = useState<any>(null);
  const [damageIdentifier, setDamageIdentifier] = useState("");
  const [damageItems, setDamageItems] = useState<
    Array<{
      sku: string;
      name: string;
      maxQty: number;
      quantity: number;
      isDamaged: boolean;
      parentComboSku?: string | null;
      unitCost: number;
    }>
  >([]);
  const [damageNotes, setDamageNotes] = useState("");
  const [damageInspector, setDamageInspector] = useState("Warehouse Staff");

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (scanType === "SINGLE" && !damageModalOpen) {
      inputRef.current?.focus();
    }
  }, [scanType, mode, damageModalOpen]);

  // Open Damage Inspection Modal for an AWB or Order #
  const openDamageInspection = async (rawQuery: string) => {
    const cleanQuery = rawQuery.trim();
    if (!cleanQuery) return;

    setDamageModalOpen(true);
    setDamageLoading(true);
    setDamageIdentifier(cleanQuery);
    setDamageDetails(null);
    setDamageItems([]);
    setDamageNotes("Damage identified during physical warehouse inspection");

    try {
      const res = await appFetch(`/api/shipments/damage?query=${encodeURIComponent(cleanQuery)}`);
      const json = await res.json();

      if (json.success) {
        setDamageDetails(json);
        const initial = (json.returnItems || []).map((item: any) => ({
          sku: item.sku,
          name: item.name,
          maxQty: item.quantity || 1,
          quantity: item.quantity || 1,
          isDamaged: true,
          parentComboSku: item.parentComboSku || null,
          unitCost: item.unitCost || 0,
        }));
        setDamageItems(initial);
      } else {
        alert(json.error || "Could not find shipment or order for damage inspection.");
        setDamageModalOpen(false);
      }
    } catch (e: any) {
      alert(`Error loading return items: ${e.message}`);
      setDamageModalOpen(false);
    } finally {
      setDamageLoading(false);
    }
  };

  // Submit Damage Inspection (Move to Damaged Quarantine)
  const handleConfirmDamageMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const damagedSelected = damageItems.filter((i) => i.isDamaged && i.quantity > 0);

    if (damagedSelected.length === 0) {
      alert("Please select at least one damaged component SKU to move to damaged quarantine.");
      return;
    }

    setDamageSubmitting(true);
    try {
      const idempotencyKey = `dmg_${damageIdentifier}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const res = await appFetch("/api/shipments/damage", {
        method: "POST",
        body: JSON.stringify({
          identifier: damageIdentifier,
          damagedItems: damagedSelected.map((i) => ({
            sku: i.sku,
            quantity: i.quantity,
            parentComboSku: i.parentComboSku,
          })),
          receivedBy: damageInspector,
          notes: damageNotes,
          idempotencyKey,
        }),
      });
      const data = await res.json();

      if (data.success) {
        if (soundEnabled) playSynthesizedBeep("damage");

        const scanEntry = {
          awb: damageIdentifier,
          mode: "DAMAGE_SCAN",
          time: new Date().toLocaleTimeString(),
          orderNumber: damageDetails?.shipment?.orderNumber || damageDetails?.order?.orderNumber,
          customerName: damageDetails?.shipment?.customerName || damageDetails?.order?.name,
          movedList: data.movedToDamage || [],
        };

        setLastScanResult(scanEntry);
        setScannedList((prev) => [scanEntry, ...prev]);
        setSessionStats((prev) => ({
          ...prev,
          total: prev.total + 1,
          damageScans: prev.damageScans + 1,
        }));

        setDamageModalOpen(false);
      } else {
        if (soundEnabled) playSynthesizedBeep("error");
        alert(data.error || "Failed to move damaged inventory.");
      }
    } catch (e: any) {
      if (soundEnabled) playSynthesizedBeep("error");
      alert(`Error: ${e.message}`);
    } finally {
      setDamageSubmitting(false);
    }
  };

  // Execute a single scan
  const executeScan = async (rawAwb: string) => {
    const cleanAwb = rawAwb.trim();
    if (!cleanAwb || processing) return;

    if (mode === "DAMAGE_SCAN") {
      setAwbInput("");
      await openDamageInspection(cleanAwb);
      return;
    }

    setProcessing(true);
    setAwbInput("");

    try {
      const res = await appFetch("/api/shipments", {
        method: "PUT",
        body: JSON.stringify({ awb: cleanAwb, mode }),
      });
      const data = await res.json();

      if (data.success) {
        const isDup = data.isDuplicate;
        if (soundEnabled) {
          if (isDup) {
            playSynthesizedBeep("duplicate");
          } else if (data.tone === "unverified_rto") {
            playSynthesizedBeep("unverified_rto");
          } else {
            playSynthesizedBeep(mode === "RTO_INWARD" ? "rto" : "success");
          }
        }

        const scanEntry = {
          awb: cleanAwb,
          mode,
          time: new Date().toLocaleTimeString(),
          isDuplicate: isDup,
          code: data.code,
          badge: data.badge,
          tone: data.tone,
          message: data.message,
          rtoVerificationStatus: data.rtoVerificationStatus,
          inventoryMoved: data.inventoryMoved,
          orderNumber: data.order?.orderNumber || data.shipment?.orderNumber,
          customerName: data.order?.name || data.shipment?.customerName,
          amount: data.order?.totalPrice || data.shipment?.amount,
        };

        setLastScanResult(scanEntry);
        setScannedList((prev) => [scanEntry, ...prev]);
        setSessionStats((prev) => ({
          ...prev,
          total: prev.total + 1,
          outwardScans: prev.outwardScans + (mode === "OUTWARD" && !isDup ? 1 : 0),
          rtoScans: prev.rtoScans + (mode === "RTO_INWARD" && !isDup ? 1 : 0),
          duplicates: prev.duplicates + (isDup ? 1 : 0),
        }));
      } else {
        if (soundEnabled) playSynthesizedBeep("error");
        setLastScanResult({
          awb: cleanAwb,
          mode,
          error: data.error,
          time: new Date().toLocaleTimeString(),
        });
      }
    } catch (err: any) {
      if (soundEnabled) playSynthesizedBeep("error");
      setLastScanResult({
        awb: cleanAwb,
        mode,
        error: err.message,
        time: new Date().toLocaleTimeString(),
      });
    } finally {
      setProcessing(false);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAwbInput(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (val.trim().length >= 6) {
      debounceTimerRef.current = setTimeout(() => {
        executeScan(val);
      }, 140);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      executeScan(awbInput);
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawAwbs = bulkText
      .split(/[\n,\s\r]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (rawAwbs.length === 0 || processing) return;

    setProcessing(true);
    setBulkResult(null);

    try {
      const res = await appFetch("/api/shipments", {
        method: "PUT",
        body: JSON.stringify({ awbs: rawAwbs, mode }),
      });
      const data = await res.json();

      if (data.success) {
        if (soundEnabled) playSynthesizedBeep("bulk");

        setBulkResult(data);
        setBulkText("");

        const newEntries = (data.results || []).map((r: any) => ({
          awb: r.awb,
          mode,
          time: new Date().toLocaleTimeString(),
          isDuplicate: r.isDuplicate,
          code: r.code,
          badge: r.badge,
          tone: r.tone,
          message: r.message,
          rtoVerificationStatus: r.rtoVerificationStatus,
          inventoryMoved: r.inventoryMoved,
          orderNumber: r.orderNumber,
          customerName: r.customerName,
          amount: r.amount,
        }));

        setScannedList((prev) => [...newEntries, ...prev]);
        setSessionStats((prev) => ({
          ...prev,
          total: prev.total + (data.total || rawAwbs.length),
          outwardScans: prev.outwardScans + (mode === "OUTWARD" ? data.successfulCount || 0 : 0),
          rtoScans: prev.rtoScans + (mode === "RTO_INWARD" ? data.successfulCount || 0 : 0),
          duplicates: prev.duplicates + (data.duplicateCount || 0),
        }));
      } else {
        if (soundEnabled) playSynthesizedBeep("error");
        setBulkResult({ error: data.error });
      }
    } catch (err: any) {
      if (soundEnabled) playSynthesizedBeep("error");
      setBulkResult({ error: err.message });
    } finally {
      setProcessing(false);
    }
  };

  const detectedBulkCount = bulkText
    .split(/[\n,\s\r]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;

  return (
    <RouteGuard requiredPermission="shipments.manage" moduleName="Barcode Dispatch & RTO Scanner">
      <div className="space-y-6 min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)]/80 pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2.5">
            <Barcode
              size={24}
              className={
                mode === "OUTWARD"
                  ? "text-cyan-400"
                  : mode === "RTO_INWARD"
                  ? "text-amber-400"
                  : "text-rose-400"
              }
            />
            <span>
              {mode === "OUTWARD"
                ? "Outward Dispatch Scanner"
                : mode === "RTO_INWARD"
                ? "RTO Inward Verification Scanner"
                : "RTO Damage Inspection Scanner"}
            </span>
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Automatic barcode gun scanning with component-level Combo damage quarantine tracking.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Scan Method Switcher: Single vs Bulk */}
          <div className="flex items-center p-1 bg-slate-900 border border-[var(--border)] rounded-xl">
            <button
              onClick={() => setScanType("SINGLE")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                scanType === "SINGLE"
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              <Zap size={13} />
              <span>Auto-Scan</span>
            </button>
            <button
              onClick={() => setScanType("BULK")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                scanType === "BULK"
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              <ListPlus size={13} />
              <span>Bulk Multi-Scan</span>
            </button>
          </div>

          {/* 3-Mode Switcher: Outward vs RTO Inward vs Damage Scan */}
          <div className="flex items-center p-1 bg-slate-900 border border-[var(--border)] rounded-xl">
            <button
              onClick={() => setMode("OUTWARD")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mode === "OUTWARD"
                  ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              <ArrowUpRight size={13} />
              <span>Outward</span>
            </button>
            <button
              onClick={() => setMode("RTO_INWARD")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mode === "RTO_INWARD"
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              <ArrowDownLeft size={13} />
              <span>RTO Inward</span>
            </button>
            <button
              onClick={() => setMode("DAMAGE_SCAN")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mode === "DAMAGE_SCAN"
                  ? "bg-gradient-to-r from-rose-600 to-red-500 text-white shadow-md shadow-rose-500/30"
                  : "text-[var(--text-secondary)] hover:text-rose-300"
              }`}
            >
              <ShieldAlert size={13} />
              <span>Damage Scan</span>
            </button>
          </div>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              soundEnabled
                ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                : "bg-[var(--surface-hover)] text-[var(--text-secondary)] border-[var(--border)]"
            }`}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span>{soundEnabled ? "Audio On" : "Muted"}</span>
          </button>
        </div>
      </div>

      {/* Mode Status Banner */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-start justify-between gap-3 transition-all ${
          mode === "OUTWARD"
            ? "bg-cyan-950/30 border-cyan-500/30 text-cyan-300"
            : mode === "RTO_INWARD"
            ? "bg-amber-950/30 border-amber-500/30 text-amber-300"
            : "bg-rose-950/30 border-rose-500/40 text-rose-300"
        }`}
      >
        <div className="flex items-start gap-3 min-w-0">
          {mode === "OUTWARD" ? (
            <Truck className="text-cyan-400 mt-0.5 shrink-0" size={20} />
          ) : mode === "RTO_INWARD" ? (
            <ShieldCheck className="text-amber-400 mt-0.5 shrink-0" size={20} />
          ) : (
            <ShieldAlert className="text-rose-400 mt-0.5 shrink-0" size={20} />
          )}
          <div className="min-w-0">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              {mode === "OUTWARD"
                ? "Outward Courier Dispatch Scanner"
                : mode === "RTO_INWARD"
                ? "RTO Inward Warehouse Verification Scanner"
                : "RTO Damage Inspection & Combo SKU Quarantine Scanner"}
            </h4>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
              {mode === "OUTWARD"
                ? "Scan packages when handing over to courier partner. Tags order as OUTWARD_SCANNED and logs dispatch timestamp."
                : mode === "RTO_INWARD"
                ? "Scan returned packages arriving back at the warehouse. Verifies physical handover and restores stock."
                : "Scan broken or returned packages. For Combos, select the exact component SKUs to quarantine into damaged stock."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-[var(--border)] text-[11px] font-mono font-bold text-cyan-400">
            {scanType === "SINGLE" ? "AUTO-SCAN" : "BULK MODE"}
          </span>
          <span
            className={`px-2.5 py-1 rounded-md bg-slate-900 border text-[11px] font-mono font-bold ${
              mode === "OUTWARD"
                ? "text-white border-[var(--border)]"
                : mode === "RTO_INWARD"
                ? "text-amber-400 border-amber-500/30"
                : "text-rose-400 border-rose-500/30"
            }`}
          >
            {mode}
          </span>
        </div>
      </div>

      {/* Main Scanner Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Scanner Active Area */}
        <div className="lg:col-span-2 space-y-4">
          {scanType === "SINGLE" ? (
            <div
              className={`glass-panel p-6 border relative overflow-hidden transition-all ${
                mode === "OUTWARD"
                  ? "border-cyan-500/30 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900"
                  : mode === "RTO_INWARD"
                  ? "border-amber-500/30 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900"
                  : "border-rose-500/40 bg-gradient-to-br from-rose-950/20 via-slate-950 to-slate-900"
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full animate-ping ${
                      mode === "OUTWARD"
                        ? "bg-cyan-400"
                        : mode === "RTO_INWARD"
                        ? "bg-amber-400"
                        : "bg-rose-400"
                    }`}
                  ></span>
                  Scanner Ready •{" "}
                  {mode === "OUTWARD"
                    ? "Scan Outward"
                    : mode === "RTO_INWARD"
                    ? "Scan Return Box"
                    : "Scan Damaged Package"}
                </span>
                <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1 font-bold">
                  <Sparkles size={12} /> Auto-detects barcode (Zero clicks needed)
                </span>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={24} />
                  <input
                    ref={inputRef}
                    type="text"
                    value={awbInput}
                    onChange={handleInputChange}
                    onKeyDown={handleInputKeyDown}
                    placeholder={
                      mode === "OUTWARD"
                        ? "Point barcode gun and scan package AWB..."
                        : mode === "RTO_INWARD"
                        ? "Point barcode gun and scan returned package AWB..."
                        : "Point barcode gun and scan damaged package AWB or Order #..."
                    }
                    className={`w-full pl-14 pr-32 py-4 bg-[var(--surface)] border-2 rounded-xl text-lg font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none shadow-inner transition-all ${
                      mode === "OUTWARD"
                        ? "border-cyan-500/40 focus:border-cyan-400"
                        : mode === "RTO_INWARD"
                        ? "border-amber-500/40 focus:border-amber-400"
                        : "border-rose-500/50 focus:border-rose-400"
                    }`}
                    autoFocus
                  />
                  <button
                    onClick={() => executeScan(awbInput)}
                    disabled={!awbInput.trim() || processing}
                    className={`absolute right-2.5 top-1/2 -translate-y-1/2 px-4 py-2 font-black text-xs rounded-lg hover:brightness-110 disabled:opacity-40 transition-all cursor-pointer ${
                      mode === "OUTWARD"
                        ? "bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 shadow-md shadow-cyan-500/20"
                        : mode === "RTO_INWARD"
                        ? "bg-gradient-to-r from-amber-500 to-orange-400 text-slate-950 shadow-md shadow-amber-500/20"
                        : "bg-gradient-to-r from-rose-600 to-red-500 text-white shadow-md shadow-rose-500/30"
                    }`}
                  >
                    {processing
                      ? "..."
                      : mode === "OUTWARD"
                      ? "DISPATCH"
                      : mode === "RTO_INWARD"
                      ? "RECEIVE"
                      : "INSPECT"}
                  </button>
                </div>
              </div>

              {/* Last Scan Live Feedback Banner */}
              {lastScanResult && (
                <div
                  className={`mt-4 p-4 rounded-xl border flex items-center justify-between transition-all ${
                    lastScanResult.error
                      ? "bg-red-500/10 border-red-500/30 text-red-300"
                      : lastScanResult.isDuplicate || lastScanResult.badge === "ALREADY SCANNED" || lastScanResult.badge === "ALREADY PROCESSED"
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                      : lastScanResult.badge === "UNVERIFIED RTO"
                      ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-300"
                      : lastScanResult.mode === "DAMAGE_SCAN"
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                      : lastScanResult.mode === "RTO_INWARD"
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                      : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {lastScanResult.error ? (
                      <AlertTriangle size={24} className="text-red-400 shrink-0" />
                    ) : lastScanResult.isDuplicate || lastScanResult.badge === "ALREADY SCANNED" || lastScanResult.badge === "ALREADY PROCESSED" ? (
                      <AlertTriangle size={24} className="text-amber-400 shrink-0" />
                    ) : lastScanResult.badge === "UNVERIFIED RTO" ? (
                      <AlertTriangle size={24} className="text-yellow-400 shrink-0" />
                    ) : lastScanResult.mode === "DAMAGE_SCAN" ? (
                      <ShieldAlert size={24} className="text-rose-400 shrink-0" />
                    ) : (
                      <CheckCircle2
                        size={24}
                        className={
                          lastScanResult.mode === "RTO_INWARD"
                            ? "text-amber-400 shrink-0"
                            : "text-emerald-400 shrink-0"
                        }
                      />
                    )}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-[var(--text-primary)]">
                          {lastScanResult.orderNumber ? `Order #${lastScanResult.orderNumber} • ` : ""}
                          AWB: {lastScanResult.awb}
                        </span>
                        {lastScanResult.badge && (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${
                              lastScanResult.badge === "UNVERIFIED RTO"
                                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                : lastScanResult.badge === "RTO RETURNED"
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                : lastScanResult.badge === "ALREADY SCANNED" || lastScanResult.badge === "ALREADY PROCESSED"
                                ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/40"
                                : "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                            }`}
                          >
                            {lastScanResult.badge}
                          </span>
                        )}
                      </div>
                      <div className="text-xs mt-0.5">
                        {lastScanResult.error
                          ? `Error: ${lastScanResult.error}`
                          : lastScanResult.message
                          ? lastScanResult.message
                          : lastScanResult.isDuplicate
                          ? `Duplicate: Already scanned previously`
                          : lastScanResult.mode === "DAMAGE_SCAN"
                          ? `Damage Quarantined: ${(lastScanResult.movedList || []).length} SKU(s) moved to damaged stock`
                          : lastScanResult.mode === "RTO_INWARD"
                          ? "Success: Returned package physically verified & received in warehouse"
                          : "Success: Outward marked & dispatched"}
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono opacity-60">{lastScanResult.time}</span>
                </div>
              )}
            </div>
          ) : (
            /* BULK SCANNER MODE */
            <div className="glass-panel p-6 border border-cyan-500/30 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <ListPlus size={16} className="text-cyan-400" /> Bulk Multi-AWB Scanner
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Paste list of AWBs or Order Numbers separated by newlines or commas.
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-cyan-400 px-3 py-1 bg-cyan-950/60 border border-cyan-500/30 rounded-lg">
                  {detectedBulkCount} AWB{detectedBulkCount !== 1 ? "s" : ""} detected
                </span>
              </div>

              <form onSubmit={handleBulkSubmit} className="space-y-3">
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={`Paste list of AWBs here...\nExample:\n1234567890123\n1234567890124`}
                  rows={6}
                  className="w-full p-4 bg-[var(--surface)] border-2 border-[var(--border)]/80 focus:border-[var(--accent)] rounded-xl text-xs font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none shadow-inner"
                />

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setBulkText("")}
                    disabled={!bulkText}
                    className="text-xs text-[var(--text-secondary)] hover:text-white px-2 py-1"
                  >
                    Clear Text
                  </button>

                  <button
                    type="submit"
                    disabled={detectedBulkCount === 0 || processing}
                    className={`flex items-center gap-2 px-6 py-2.5 font-bold text-xs rounded-xl shadow-lg transition-all cursor-pointer ${
                      mode === "OUTWARD"
                        ? "bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 shadow-cyan-500/20 hover:brightness-110"
                        : "bg-gradient-to-r from-amber-500 to-orange-400 text-slate-950 shadow-amber-500/20 hover:brightness-110"
                    } disabled:opacity-40`}
                  >
                    <CheckCheck size={16} />
                    <span>
                      {processing
                        ? "Processing Batch..."
                        : `Process Bulk ${mode === "OUTWARD" ? "Outward" : "RTO Inward"} (${detectedBulkCount} AWBs)`}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Recent Scans Table */}
          <div className="glass-panel overflow-hidden border border-[var(--border)]">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-2">
                <Clock size={14} /> Today&apos;s Scanned Packages ({scannedList.length})
              </h3>
              {scannedList.length > 0 && (
                <button
                  onClick={() => setScannedList([])}
                  className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer"
                >
                  Clear Session List
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/80 text-xs">
              {scannedList.length === 0 ? (
                <div className="p-8 text-center text-[var(--text-muted)]">
                  No packages scanned yet in this session. Start scanning with your gun above.
                </div>
              ) : (
                scannedList.map((item, idx) => (
                  <div key={idx} className="p-3.5 flex items-center justify-between table-row-hover">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[var(--text-muted)] text-[10px]">#{scannedList.length - idx}</span>
                      <span className="font-mono font-bold text-[var(--text-primary)] select-all">{item.awb}</span>
                      {item.orderNumber && (
                        <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                          (#{item.orderNumber})
                        </span>
                      )}
                      {item.badge ? (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            item.badge === "UNVERIFIED RTO"
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                              : item.badge === "RTO RETURNED"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : item.badge === "ALREADY SCANNED" || item.badge === "ALREADY PROCESSED"
                              ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                              : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                          }`}
                        >
                          {item.badge}
                        </span>
                      ) : item.mode === "DAMAGE_SCAN" ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                          <ShieldAlert size={11} /> Damaged Quarantine
                        </span>
                      ) : item.mode === "RTO_INWARD" ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          RTO Received
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Outward Dispatched
                        </span>
                      )}
                      {item.isDuplicate && (
                        <span className="text-[10px] text-amber-400 font-mono">Duplicate</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {item.mode === "RTO_INWARD" && (
                        <button
                          onClick={() => openDamageInspection(item.awb)}
                          className="px-2 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <ShieldAlert size={11} /> Flag Damage
                        </button>
                      )}
                      <span className="font-mono text-[var(--text-secondary)] text-[11px]">{item.time}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: Metrics */}
        <div className="space-y-4">
          <div className="glass-panel p-5 border border-[var(--border)] space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-2">
              <Sparkles size={14} className="text-cyan-400" /> Session Metrics
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase block">Total Scans</span>
                <span className="text-2xl font-black text-[var(--text-primary)] font-mono">{sessionStats.total}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                <span className="text-[10px] font-bold text-emerald-400 uppercase block">Outward Scans</span>
                <span className="text-2xl font-black text-emerald-400 font-mono">{sessionStats.outwardScans}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                <span className="text-[10px] font-bold text-amber-400 uppercase block">RTO Inwards</span>
                <span className="text-2xl font-black text-amber-400 font-mono">{sessionStats.rtoScans}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-rose-500/30">
                <span className="text-[10px] font-bold text-rose-400 uppercase block">Damaged Scans</span>
                <span className="text-2xl font-black text-rose-400 font-mono">{sessionStats.damageScans}</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-gradient-to-br from-amber-950/30 via-[var(--surface)] to-[var(--surface)] border border-amber-500/20 text-xs text-[var(--text-secondary)] space-y-2">
              <div className="font-bold text-amber-400 flex items-center gap-1.5">
                <ShieldCheck size={16} /> RTO Anti-Fraud Verification
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                Protects against courier partner false &ldquo;RTO Delivered&rdquo; updates. Manual verification tags are updated instantly.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* DAMAGE INSPECTION MODAL */}
      {damageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-[var(--surface)] border border-rose-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 sm:p-5 bg-[var(--surface)] border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-[var(--text-primary)] text-base">RTO Damage Scan &amp; SKU Separation</h3>
                  <p className="text-xs text-[var(--text-secondary)] font-mono">
                    AWB / Ref: <strong className="text-rose-400">{damageIdentifier}</strong>
                    {damageDetails?.order?.orderNumber && ` • Order #${damageDetails.order.orderNumber}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDamageModalOpen(false)}
                className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface-hover)] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs">
              {damageLoading ? (
                <div className="py-16 text-center text-[var(--text-secondary)] space-y-2">
                  <p className="text-xs">Loading package &amp; constituent items...</p>
                </div>
              ) : (
                <form onSubmit={handleConfirmDamageMovement} className="space-y-5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                      <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                        <Boxes size={14} className="text-rose-400" />
                        Select Damaged Component SKUs to Quarantine:
                      </span>
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        {damageItems.filter((i) => i.isDamaged).length} of {damageItems.length} SKUs marked damaged
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {damageItems.map((item, idx) => (
                        <div
                          key={idx}
                          className={`p-3.5 rounded-xl border transition-all ${
                            item.isDamaged
                              ? "bg-rose-950/20 border-rose-500/40"
                              : "bg-[var(--bg-secondary)] border-[var(--border)] opacity-70"
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={item.isDamaged}
                                onChange={(e) => {
                                  const next = [...damageItems];
                                  next[idx].isDamaged = e.target.checked;
                                  setDamageItems(next);
                                }}
                                className="mt-1 w-4 h-4 rounded border-[var(--border)] text-rose-600 focus:ring-rose-500"
                              />

                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono font-bold text-[var(--text-primary)] text-sm">{item.sku}</span>
                                  {item.parentComboSku ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                                      <Puzzle size={10} /> Part of Combo: {item.parentComboSku}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--surface-hover)] text-[var(--text-secondary)] border border-[var(--border)]">
                                      Single Product
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">{item.name}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 self-end sm:self-auto">
                              <div className="flex items-center gap-1.5">
                                <label className="text-[10px] text-[var(--text-secondary)] font-semibold">Damaged Qty:</label>
                                <input
                                  type="number"
                                  min="1"
                                  max={item.maxQty}
                                  value={item.quantity}
                                  disabled={!item.isDamaged}
                                  onChange={(e) => {
                                    const next = [...damageItems];
                                    next[idx].quantity = Math.min(
                                      item.maxQty,
                                      Math.max(1, parseInt(e.target.value, 10) || 1)
                                    );
                                    setDamageItems(next);
                                  }}
                                  className="w-16 bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono font-bold text-center disabled:opacity-40"
                                />
                                <span className="text-[var(--text-muted)] text-xs">/ {item.maxQty}</span>
                              </div>

                              <span
                                className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                                  item.isDamaged
                                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                    : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                }`}
                              >
                                {item.isDamaged ? "Move to Damaged" : "Keep in Saleable"}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="text-[var(--text-secondary)] font-semibold block mb-1">Inspector Name</label>
                      <input
                        type="text"
                        value={damageInspector}
                        onChange={(e) => setDamageInspector(e.target.value)}
                        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                      />
                    </div>
                    <div>
                      <label className="text-[var(--text-secondary)] font-semibold block mb-1">Damage Notes</label>
                      <input
                        type="text"
                        value={damageNotes}
                        onChange={(e) => setDamageNotes(e.target.value)}
                        placeholder="e.g. Broken nozzle, cracked bottle"
                        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setDamageModalOpen(false)}
                      className="px-4 py-2 rounded-xl bg-[var(--surface-hover)] hover:bg-slate-700 text-[var(--text-secondary)] font-semibold text-xs cursor-pointer"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={damageSubmitting || damageItems.filter((i) => i.isDamaged).length === 0}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition-all flex items-center gap-2 disabled:opacity-40 cursor-pointer"
                    >
                      <ShieldAlert size={14} />
                      <span>
                        {damageSubmitting
                          ? "Processing Movement..."
                          : `Move ${damageItems.filter((i) => i.isDamaged).length} Damaged SKU(s) to Damaged Quarantine`}
                      </span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </RouteGuard>
  );
}
