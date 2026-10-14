"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Printer,
  ArrowLeft,
  Building2,
  Receipt,
  RefreshCw,
  AlertCircle,
  FileText,
  Layers,
  CheckCircle2,
} from "lucide-react";
import { appFetch } from "@/lib/api";

export default function OrderInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pageSize, setPageSize] = useState<"A4" | "4x6" | "A5" | "letter">("A4");

  const fetchInvoice = async () => {
    try {
      setLoading(true);
      const res = await appFetch(`/api/orders/${id}/invoice`);
      const data = await res.json();
      if (data.success && data.invoice) {
        setInvoice(data.invoice);
      } else {
        setError(data.error || "Failed to load tax invoice.");
      }
    } catch (err: any) {
      setError(err.message || "Network error loading invoice.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchInvoice();
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="animate-spin text-indigo-400" size={32} />
          <p className="text-sm font-bold text-slate-400">Generating GST Tax Invoice...</p>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-slate-950 text-white">
        <div className="glass-panel p-6 rounded-2xl max-w-md text-center space-y-4 border border-rose-500/30">
          <AlertCircle className="text-rose-400 mx-auto" size={36} />
          <h2 className="text-lg font-bold">Invoice Not Found</h2>
          <p className="text-xs text-slate-400">{error || "Could not retrieve invoice for this order."}</p>
          <button
            onClick={() => router.push("/orders")}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold transition-all"
          >
            Back to Orders
          </button>
        </div>
      </div>
    );
  }

  const { company, customer, items, summary } = invoice;
  const isThermal = pageSize === "4x6";
  const isA5 = pageSize === "A5";
  const isMultiPage = items.length > 5;

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] text-slate-900 py-6 px-3 sm:px-6 print:p-0 print:m-0 print:bg-white print:min-h-0">
      {/* Dynamic CSS for Print Size & Adaptive Page Scaling */}
      <style jsx global>{`
        @media print {
          @page {
            size: ${pageSize === "4x6" ? "4in 6in" : pageSize === "A5" ? "A5" : pageSize === "letter" ? "letter" : "A4"};
            margin: ${pageSize === "4x6" ? "1mm" : pageSize === "A5" ? "3mm 4mm" : "4mm 6mm"};
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-sizing: border-box !important;
          }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            padding: 0 !important;
            margin: 0 !important;
            height: ${!isMultiPage ? "100%" : "auto"} !important;
            overflow: visible !important;
          }
          .invoice-container {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: ${
              isThermal
                ? "2px 4px !important"
                : isA5
                ? "4px 8px !important"
                : isMultiPage
                ? "10px 14px !important"
                : "6px 12px !important"
            };
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            ${
              !isMultiPage
                ? `page-break-inside: avoid !important;
                   break-inside: avoid !important;
                   page-break-after: avoid !important;
                   break-after: avoid !important;`
                : ""
            }
          }
          .print-signature-img {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
          }
        }
      `}</style>

      {/* Top Action Bar (Hidden on Print) */}
      <div className="max-w-4xl mx-auto mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/orders")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs font-bold text-[var(--text-secondary)] hover:bg-slate-50 dark:hover:bg-slate-850 transition-all cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>Back to Orders</span>
          </button>

          {/* Page Size Selector */}
          <div className="flex items-center bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1 shadow-sm">
            <span className="text-[10px] font-bold text-slate-500 uppercase px-2 flex items-center gap-1">
              <Layers size={12} /> Size:
            </span>
            {(
              [
                { id: "A4", label: "A4 (Full Page)" },
                { id: "4x6", label: "4x6\" (Thermal Roll)" },
                { id: "A5", label: "A5 (Half Page)" },
                { id: "letter", label: "Letter" },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                onClick={() => setPageSize(s.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  pageSize === s.id
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/settings/company")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-850 transition-all cursor-pointer"
          >
            <Building2 size={14} />
            <span>Edit Company Master</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/25 transition-all cursor-pointer"
          >
            <Printer size={15} />
            <span>Print ({pageSize})</span>
          </button>
        </div>
      </div>

      {/* Invoice Container */}
      <div
        className={`invoice-container mx-auto bg-white text-slate-900 shadow-2xl border border-slate-300 font-sans transition-all print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-full ${
          isThermal
            ? "max-w-[380px] p-2.5 text-[7.5px] rounded-lg"
            : isA5
            ? "max-w-2xl p-4 text-[9px] rounded-xl"
            : isMultiPage
            ? "max-w-4xl p-8 text-xs rounded-2xl"
            : "max-w-4xl p-5 text-[10px] rounded-2xl"
        }`}
      >
        {/* Header Title Banner */}
        <div
          className={`flex justify-between items-start border-b-2 border-slate-900 ${
            isThermal ? "pb-1" : isA5 ? "pb-1.5" : isMultiPage ? "pb-3" : "pb-2"
          }`}
        >
          <div className="space-y-0.5">
            <span className="text-[7.5px] font-black uppercase tracking-widest text-indigo-700 block leading-none">
              TAX INVOICE (ORIGINAL)
            </span>
            <h1
              className={`font-black tracking-tight text-slate-950 leading-none ${
                isThermal ? "text-xs" : isA5 ? "text-base" : isMultiPage ? "text-2xl" : "text-lg"
              }`}
            >
              {company.legalName || ""}
            </h1>
            {company.tradeName && (
              <p className={`font-bold text-slate-600 leading-tight ${isThermal ? "text-[7.5px]" : "text-[10px]"}`}>
                Trade: {company.tradeName}
              </p>
            )}
            <p
              className={`text-slate-600 max-w-sm leading-tight ${
                isThermal ? "text-[7px]" : isA5 ? "text-[8.5px]" : "text-[9.5px]"
              }`}
            >
              {company.address}, {company.city}, {company.state} - {company.pincode}
            </p>
          </div>

          <div className="text-right space-y-0.5">
            {company.logoUrl ? (
              company.logoUrl?.startsWith("data:application/pdf") ? (
                <div className="border border-slate-300 rounded p-0.5 inline-flex items-center gap-1 ml-auto mb-0.5">
                  <FileText size={11} className="text-rose-500" />
                  <span className="text-[8px] font-bold font-sans text-slate-800">
                    {company.tradeName || company.legalName}
                  </span>
                </div>
              ) : (
                <img
                  src={company.logoUrl}
                  alt="Logo"
                  className={`object-contain ml-auto mb-0.5 ${
                    isThermal
                      ? "h-5 max-w-[65px]"
                      : isA5
                      ? "h-8 max-w-[95px]"
                      : isMultiPage
                      ? "h-11 max-w-[140px]"
                      : "h-8 max-w-[110px]"
                  }`}
                />
              )
            ) : (
              <div
                className={`bg-slate-950 text-white flex items-center justify-center font-black rounded ml-auto mb-0.5 ${
                  isThermal ? "w-5 h-5 text-[9px]" : isA5 ? "w-8 h-8 text-xs" : "w-10 h-10 text-base"
                }`}
              >
                {company.legalName?.trim() ? company.legalName.trim().charAt(0).toUpperCase() : "C"}
              </div>
            )}
            <div
              className={`font-mono text-slate-800 font-bold leading-none ${
                isThermal ? "text-[7px]" : isA5 ? "text-[8.5px]" : "text-[9.5px]"
              }`}
            >
              <span>GSTIN: </span>
              <strong className="text-indigo-900 font-black">{company.gstin}</strong>
            </div>
            {company.pan && (
              <div
                className={`font-mono text-slate-700 leading-none ${
                  isThermal ? "text-[6.5px]" : isA5 ? "text-[8px]" : "text-[9px]"
                }`}
              >
                <span>PAN: </span>
                <strong>{company.pan}</strong>
              </div>
            )}
            <div
              className={`text-slate-600 leading-none ${
                isThermal ? "text-[6.5px]" : isA5 ? "text-[8px]" : "text-[9px]"
              }`}
            >
              <span>State: </span>
              <strong>
                {company.state} ({company.stateCode})
              </strong>
            </div>
          </div>
        </div>

        {/* Invoice & Order Metadata Grid */}
        <div
          className={`grid grid-cols-4 gap-1 py-1 border-b border-slate-200 bg-slate-50 px-1.5 my-1 rounded ${
            isThermal ? "text-[7px]" : isA5 ? "text-[8px]" : "text-[9.5px]"
          }`}
        >
          <div>
            <span className="text-slate-500 block text-[6.5px] uppercase font-bold leading-none">Invoice No</span>
            <strong className="font-mono text-indigo-800 font-black truncate block">{invoice.invoiceNumber}</strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[6.5px] uppercase font-bold leading-none">Invoice Date</span>
            <strong className="font-mono truncate block">{new Date(invoice.invoiceDate).toLocaleDateString()}</strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[6.5px] uppercase font-bold leading-none">Order #</span>
            <strong className="font-mono truncate block">#{invoice.orderNumber}</strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[6.5px] uppercase font-bold leading-none">Payment</span>
            <strong className={`truncate block ${invoice.paymentMethod === "Prepaid" ? "text-emerald-800" : "text-amber-800"}`}>
              {invoice.paymentMethod}
            </strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[6.5px] uppercase font-bold leading-none">Place of Supply</span>
            <strong className="truncate block">{invoice.placeOfSupply}</strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[6.5px] uppercase font-bold leading-none">GST Route</span>
            <strong className="text-indigo-900 truncate block">
              {invoice.isIntraState ? "Intra (CGST+SGST)" : "Inter (IGST)"}
            </strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[6.5px] uppercase font-bold leading-none">Reverse Charge</span>
            <strong className="truncate block">{invoice.reverseCharge}</strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[6.5px] uppercase font-bold leading-none">Courier / AWB</span>
            <strong className="font-mono truncate block">{invoice.awb || "—"}</strong>
          </div>
        </div>

        {/* Billed To & Shipped To Section (Always Side-by-Side) */}
        <div
          className={`grid grid-cols-2 gap-2 py-1 border-b border-slate-200 ${
            isThermal ? "text-[7px]" : isA5 ? "text-[8px]" : "text-[9.5px]"
          }`}
        >
          {/* Bill To */}
          <div className="space-y-0.5">
            <span className="text-[6.5px] font-black uppercase text-slate-500 tracking-wider block leading-none">
              Billed To (Customer):
            </span>
            <p className="font-bold text-slate-900 leading-tight">{customer.billingAddress?.name || customer.name}</p>
            <p className="text-slate-600 leading-tight line-clamp-2">
              {customer.billingAddress?.address1}
              {customer.billingAddress?.address2 ? `, ${customer.billingAddress?.address2}` : ""}
            </p>
            <p className="text-slate-600 leading-tight">
              {customer.billingAddress?.city}, {customer.billingAddress?.state} - {customer.billingAddress?.zip}
            </p>
            {customer.phone && <p className="text-slate-600 font-mono text-[6.5px]">Ph: {customer.phone}</p>}
          </div>

          {/* Ship To */}
          <div className="space-y-0.5 border-l pl-2 border-slate-200">
            <span className="text-[6.5px] font-black uppercase text-slate-500 tracking-wider block leading-none">
              Shipped To:
            </span>
            <p className="font-bold text-slate-900 leading-tight">{customer.shippingAddress?.name || customer.name}</p>
            <p className="text-slate-600 leading-tight line-clamp-2">
              {customer.shippingAddress?.address1}
              {customer.shippingAddress?.address2 ? `, ${customer.shippingAddress?.address2}` : ""}
            </p>
            <p className="text-slate-600 leading-tight">
              {customer.shippingAddress?.city}, {customer.shippingAddress?.state} - {customer.shippingAddress?.zip}
            </p>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="my-1 overflow-x-auto">
          <table className="w-full text-left border-collapse border border-slate-300">
            <thead>
              <tr
                className={`bg-slate-100 text-slate-800 font-bold uppercase tracking-wider border-b border-slate-300 ${
                  isThermal ? "text-[6.5px]" : isA5 ? "text-[7.5px]" : "text-[8.5px]"
                }`}
              >
                <th className="p-0.5 border-r border-slate-300 text-center w-4">#</th>
                <th className="p-0.5 px-1 border-r border-slate-300">Item Description</th>
                <th className="p-0.5 border-r border-slate-300 text-center">HSN</th>
                <th className="p-0.5 border-r border-slate-300 text-center">Qty</th>
                <th className="p-0.5 border-r border-slate-300 text-right">Unit Price</th>
                <th className="p-0.5 border-r border-slate-300 text-right">Discount</th>
                <th className="p-0.5 border-r border-slate-300 text-right">Taxable</th>
                {invoice.isIntraState ? (
                  <>
                    <th className="p-0.5 border-r border-slate-300 text-right">CGST</th>
                    <th className="p-0.5 border-r border-slate-300 text-right">SGST</th>
                  </>
                ) : (
                  <th className="p-0.5 border-r border-slate-300 text-right">IGST</th>
                )}
                <th className="p-0.5 px-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody
              className={`divide-y divide-slate-200 font-medium ${
                isThermal ? "text-[7px]" : isA5 ? "text-[8px]" : "text-[9.5px]"
              }`}
            >
              {items.map((item: any, idx: number) => {
                if (item.isComboHeader) {
                  return (
                    <tr key={idx} className="bg-slate-100/90 font-bold border-t border-b border-slate-300">
                      <td className="p-0.5 border-r border-slate-300 text-center text-slate-800">{item.srNo}</td>
                      <td className="p-0.5 px-1 border-r border-slate-300">
                        <span className="font-extrabold text-indigo-950 block leading-tight">
                          COMBO: {item.title}
                        </span>
                        <span className="font-mono text-[6.5px] text-slate-600 block">
                          SKU: {item.sku} • [COMBO KIT] — Included Invoice Components:
                        </span>
                      </td>
                      <td className="p-0.5 border-r border-slate-300 text-center font-mono text-slate-400">—</td>
                      <td className="p-0.5 border-r border-slate-300 text-center font-bold text-slate-900">{item.quantity}</td>
                      <td className="p-0.5 border-r border-slate-300 text-right font-mono text-slate-900">
                        ₹{(item.unitPrice ?? 0).toFixed(2)}
                      </td>
                      <td className="p-0.5 border-r border-slate-300 text-right font-mono text-emerald-800">
                        {item.discountAmount && item.discountAmount > 0 ? `₹${item.discountAmount.toFixed(2)}` : "—"}
                      </td>
                      <td className="p-0.5 border-r border-slate-300 text-right font-mono text-slate-400">—</td>
                      {invoice.isIntraState ? (
                        <>
                          <td className="p-0.5 border-r border-slate-300 text-right font-mono text-slate-400">—</td>
                          <td className="p-0.5 border-r border-slate-300 text-right font-mono text-slate-400">—</td>
                        </>
                      ) : (
                        <td className="p-0.5 border-r border-slate-300 text-right font-mono text-slate-400">—</td>
                      )}
                      <td className="p-0.5 px-1 text-right font-mono font-black text-slate-950">
                        ₹{item.grossTotal.toFixed(2)}
                      </td>
                    </tr>
                  );
                }

                if (item.isComboComponent) {
                  return (
                    <tr key={idx} className="bg-white hover:bg-slate-50 text-[9px]">
                      <td className="p-0.5 border-r border-slate-300 text-center text-indigo-500 font-mono">↳</td>
                      <td className="p-0.5 px-1 border-r border-slate-300 pl-3">
                        <div className="border-l-2 border-indigo-400 pl-1.5 py-0.5">
                          <span className="font-bold text-slate-900 block leading-tight">{item.title}</span>
                          <span className="font-mono text-[6.5px] text-slate-500">
                            Component SKU: {item.sku} • GST: {item.taxRate}%
                          </span>
                        </div>
                      </td>
                      <td className="p-0.5 border-r border-slate-300 text-center font-mono text-[7.5px]">{item.hsnCode || "—"}</td>
                      <td className="p-0.5 border-r border-slate-300 text-center font-semibold">{item.quantity}</td>
                      <td className="p-0.5 border-r border-slate-300 text-right font-mono">
                        ₹{(item.unitPrice ?? 0).toFixed(2)}
                      </td>
                      <td className="p-0.5 border-r border-slate-300 text-right font-mono text-emerald-800">
                        {item.discountAmount && item.discountAmount > 0 ? `₹${item.discountAmount.toFixed(2)}` : "—"}
                      </td>
                      <td className="p-0.5 border-r border-slate-300 text-right font-mono font-semibold">
                        ₹{item.taxableValue.toFixed(2)}
                      </td>
                      {invoice.isIntraState ? (
                        <>
                          <td className="p-0.5 border-r border-slate-300 text-right font-mono text-emerald-800">
                            ₹{item.cgstAmount.toFixed(2)}
                          </td>
                          <td className="p-0.5 border-r border-slate-300 text-right font-mono text-emerald-800">
                            ₹{item.sgstAmount.toFixed(2)}
                          </td>
                        </>
                      ) : (
                        <td className="p-0.5 border-r border-slate-300 text-right font-mono text-cyan-800">
                          ₹{item.igstAmount.toFixed(2)}
                        </td>
                      )}
                      <td className="p-0.5 px-1 text-right font-mono font-bold text-slate-800">
                        ₹{item.grossTotal.toFixed(2)}
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={item.srNo ?? idx} className="hover:bg-slate-50">
                    <td className="p-0.5 border-r border-slate-300 text-center text-slate-500">{item.srNo}</td>
                    <td className="p-0.5 px-1 border-r border-slate-300">
                      <span className="font-bold block leading-tight">{item.title}</span>
                      <span className="font-mono text-[6.5px] text-slate-500">
                        SKU: {item.sku} {item.type === "COMBO" ? "• [COMBO]" : ""}
                      </span>
                    </td>
                    <td className="p-0.5 border-r border-slate-300 text-center font-mono">{item.hsnCode || "—"}</td>
                    <td className="p-0.5 border-r border-slate-300 text-center font-bold">{item.quantity}</td>
                    <td className="p-0.5 border-r border-slate-300 text-right font-mono">
                      ₹{(item.unitPrice ?? item.unitPriceExclTax ?? 0).toFixed(2)}
                    </td>
                    <td className="p-0.5 border-r border-slate-300 text-right font-mono text-emerald-800">
                      {item.discountAmount && item.discountAmount > 0 ? `₹${item.discountAmount.toFixed(2)}` : "—"}
                    </td>
                    <td className="p-0.5 border-r border-slate-300 text-right font-mono font-semibold">
                      ₹{item.taxableValue.toFixed(2)}
                    </td>
                    {invoice.isIntraState ? (
                      <>
                        <td className="p-0.5 border-r border-slate-300 text-right font-mono text-emerald-800">
                          ₹{item.cgstAmount.toFixed(2)}
                        </td>
                        <td className="p-0.5 border-r border-slate-300 text-right font-mono text-emerald-800">
                          ₹{item.sgstAmount.toFixed(2)}
                        </td>
                      </>
                    ) : (
                      <td className="p-0.5 border-r border-slate-300 text-right font-mono text-cyan-800">
                        ₹{item.igstAmount.toFixed(2)}
                      </td>
                    )}
                    <td className="p-0.5 px-1 text-right font-mono font-black text-slate-950">
                      ₹{item.grossTotal.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Invoice Summary & Tax Totals Calculation (Side-by-Side Grid) */}
        <div
          className={`grid grid-cols-12 gap-1.5 pt-0.5 ${
            isThermal ? "text-[7px]" : isA5 ? "text-[8px]" : "text-[9.5px]"
          }`}
        >
          {/* Left Column: Bank Details & Amount in Words */}
          <div className="col-span-7 space-y-1">
            <div>
              <span className="text-[6.5px] font-black uppercase text-slate-500 block leading-none">Total in Words:</span>
              <p className="font-bold text-slate-900 text-[7px] italic bg-slate-50 p-1 rounded border border-slate-200 leading-tight">
                {summary.amountInWords}
              </p>
            </div>

            {/* Bank Details Box */}
            <div className="p-1 bg-slate-50 rounded border border-slate-200 text-[6.5px] space-y-0.5 leading-tight">
              <span className="font-bold text-slate-800 block text-[7px] leading-none">Bank Details:</span>
              <p>
                <span className="text-slate-500">Bank:</span> <strong>{company.bankName}</strong> |{" "}
                <span className="text-slate-500">A/C:</span> <strong className="font-mono">{company.accountNumber}</strong>
              </p>
              <p>
                <span className="text-slate-500">IFSC:</span> <strong className="font-mono">{company.ifscCode}</strong>{" "}
                {company.upiId && (
                  <>
                    | <span className="text-slate-500">UPI:</span>{" "}
                    <strong className="font-mono">{company.upiId}</strong>
                  </>
                )}
              </p>
            </div>

            {/* Declaration */}
            <p className="text-[6.5px] text-slate-500 leading-tight italic line-clamp-1">{company.declaration}</p>
          </div>

          {/* Right Column: Financial Totals Box */}
          <div className="col-span-5 border border-slate-300 rounded p-1 space-y-0.5 bg-slate-50/50">
            <div className="flex justify-between text-slate-700 leading-tight">
              <span>Taxable:</span>
              <span className="font-mono font-bold">₹{summary.subtotalTaxable.toFixed(2)}</span>
            </div>

            {summary.totalDiscounts && summary.totalDiscounts > 0 ? (
              <div className="flex justify-between text-emerald-800 font-mono text-[6.5px] leading-tight font-bold">
                <span>Discounts:</span>
                <span>-₹{summary.totalDiscounts.toFixed(2)}</span>
              </div>
            ) : null}

            {invoice.isIntraState ? (
              <>
                <div className="flex justify-between text-emerald-800 font-mono text-[6.5px] leading-tight">
                  <span>CGST:</span>
                  <span>₹{summary.totalCgst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-800 font-mono text-[6.5px] leading-tight">
                  <span>SGST:</span>
                  <span>₹{summary.totalSgst.toFixed(2)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-cyan-800 font-mono text-[6.5px] leading-tight">
                <span>IGST:</span>
                <span>₹{summary.totalIgst.toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between text-slate-700 leading-tight">
              <span>Total Tax:</span>
              <span className="font-mono font-bold text-amber-800">₹{summary.totalTax.toFixed(2)}</span>
            </div>

            <div className="flex justify-between text-slate-700 leading-tight">
              <span>Shipping:</span>
              <span className="font-mono">₹{summary.shippingCharge.toFixed(2)}</span>
            </div>

            {summary.roundOff !== 0 && (
              <div className="flex justify-between text-slate-500 text-[6.5px] leading-tight">
                <span>Round Off:</span>
                <span className="font-mono">₹{summary.roundOff.toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between items-center pt-0.5 border-t border-slate-900 font-bold text-xs text-slate-950 leading-tight">
              <span className="text-[7.5px] uppercase">Grand Total:</span>
              <span className="font-mono text-[11px] font-black text-indigo-900">
                ₹{Number(summary.grandTotal).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer: Terms & Authorized Signatory (Always Side-by-Side) */}
        <div
          className={`grid grid-cols-2 gap-2 pt-1 mt-1 border-t border-slate-300 ${
            isThermal ? "text-[6.5px]" : isA5 ? "text-[7.5px]" : "text-[8.5px]"
          }`}
        >
          <div className="space-y-0.5">
            <span className="font-bold text-slate-800 uppercase tracking-wider block text-[6.5px] leading-none">
              Terms &amp; Conditions:
            </span>
            <p className="text-slate-600 whitespace-pre-line leading-tight line-clamp-2">{company.termsConditions}</p>
          </div>

          <div className="text-right space-y-0.5 flex flex-col justify-end">
            <span className="text-slate-700 font-bold block text-[7px] leading-none">
              For {company.legalName || "Seller"}:
            </span>

            {/* Signature Area (Always visible on print) */}
            <div className="h-6 flex items-center justify-end print:min-h-[22px] print-signature">
              {company.signatureUrl ? (
                company.signatureUrl?.startsWith("data:application/pdf") ? (
                  <div className="border border-slate-400 rounded px-1 py-0.5 inline-flex items-center gap-1 bg-white">
                    <FileText size={10} className="text-rose-500" />
                    <span className="text-[7px] font-bold text-slate-900">Authorized Stamp Attached</span>
                  </div>
                ) : (
                  <img
                    src={company.signatureUrl}
                    alt="Authorized Signature"
                    className="h-6 max-w-[85px] object-contain inline-block print:block print-signature-img"
                    crossOrigin="anonymous"
                  />
                )
              ) : (
                <div className="border-b border-dashed border-slate-400 w-24 h-4 flex items-end justify-center">
                  <span className="text-[6.5px] italic text-slate-400 font-mono">[ Digitally Signed ]</span>
                </div>
              )}
            </div>

            <span className="font-bold text-slate-950 border-t border-slate-900 pt-0.5 inline-block text-[7.5px] leading-none">
              {company.authorizedSignatory || "Authorized Signatory"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
