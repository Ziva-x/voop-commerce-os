"use client";

import { useEffect, useState } from "react";
import {
  Package,
  Search,
  Filter,
  RefreshCw,
  Eye,
  X,
  Layers,
  Copy,
  Check,
  Tag,
  ExternalLink,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { appFetch } from "@/lib/api";
import { TableSkeleton } from "@/components/LoadingSkeleton";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { SearchInput } from "@/components/ui/Input";
import { Drawer } from "@/components/ui";

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [skuFilter, setSkuFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Selected Variant Drawer
  const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "25",
        search,
        sku: skuFilter,
        status: statusFilter,
      });
      const res = await appFetch(`/api/products?${params.toString()}`);
      const json = await res.json();
      setProducts(json.products || []);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [page, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchProducts();
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <RouteGuard requiredPermission="products.view" moduleName="Products & Variants">
      <div className="space-y-6 w-full min-w-0">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)]/80 pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2.5">
            <Package className="text-cyan-600 dark:text-cyan-400" size={24} /> Products &amp; Variants
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Shopify product catalog and permanent <span className="text-cyan-600 dark:text-cyan-400 font-semibold">Shopify Variant IDs</span> mapped to VOOP BOM.
          </p>
        </div>

        <button
          onClick={fetchProducts}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border)] text-sm font-semibold self-start sm:self-auto transition-all cursor-pointer"
        >
          <RefreshCw size={14} className={loading ? "animate-spin text-cyan-600 dark:text-cyan-400" : ""} />
          <span>Refresh Catalog</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="glass-panel p-4 sm:p-5">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
          <div className="sm:col-span-5">
            <SearchInput
              placeholder="Search product title, variant, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClear={() => setSearch("")}
              className="py-2.5 text-sm"
            />
          </div>

          <div className="sm:col-span-3">
            <input
              type="text"
              placeholder="Filter by SKU (e.g. FSLG)..."
              value={skuFilter}
              onChange={(e) => setSkuFilter(e.target.value)}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-slate-400 focus:outline-none focus:border-[var(--accent)] font-mono transition-all"
            />
          </div>

          <div className="sm:col-span-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-all cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm py-2.5 rounded-xl transition-all shadow-sm cursor-pointer"
            >
              Apply Filter
            </button>
          </div>
        </form>
      </div>

      {/* Products & Variants Table */}
      <div className="glass-panel overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[var(--border)] flex items-center justify-between text-sm text-[var(--text-muted)]">
          <span>
            Showing <strong className="text-[var(--text-primary)] font-semibold">{products.length}</strong> products (<strong className="text-[var(--text-primary)] font-semibold">{total}</strong> total)
          </span>
          <span className="font-medium">Page {page} of {totalPages}</span>
        </div>

        {loading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : products.length === 0 ? (
          <div className="p-16 text-center text-slate-500 text-sm">
            No products found matching your filters.
          </div>
        ) : (
          <div className="overflow-x-auto animate-fade-in">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-[var(--bg-secondary)]/80 border-b border-[var(--border)] text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wider">
                  <th className="py-3.5 px-5">Product Title</th>
                  <th className="py-3.5 px-5">Variant Title</th>
                  <th className="py-3.5 px-5">SKU</th>
                  <th className="py-3.5 px-5">Shopify Variant ID</th>
                  <th className="py-3.5 px-5">Price</th>
                  <th className="py-3.5 px-5">Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {products.map((product) =>
                  product.variants.map((variant: any) => (
                    <tr
                      key={variant.id}
                      className="table-row-hover transition-colors cursor-pointer"
                      onClick={() => setSelectedVariant({ ...variant, product })}
                    >
                      {/* Product Title (with thumbnail if available) */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3.5">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.title}
                              className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-[var(--border)] shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-[var(--border)] flex items-center justify-center text-slate-400 shrink-0">
                              <Package size={16} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-[var(--text-primary)] truncate max-w-[280px]">
                              {product.title}
                            </p>
                            <p className="text-xs text-[var(--text-muted)] font-mono truncate mt-0.5">
                              ID: {product.shopifyProductId}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Variant Title */}
                      <td className="py-3.5 px-5 text-[var(--text-primary)]">
                        {variant.title === "Default Title" ? (
                          <span className="text-slate-400 italic">Default</span>
                        ) : (
                          <span className="font-medium">{variant.title}</span>
                        )}
                      </td>

                      {/* SKU */}
                      <td className="py-3.5 px-5">
                        {variant.sku ? (
                          <span className="font-mono bg-slate-100 dark:bg-slate-800/90 px-2.5 py-1 rounded-md border border-[var(--border)] text-cyan-700 dark:text-cyan-300 font-semibold text-xs">
                            {variant.sku}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-xs">No SKU</span>
                        )}
                      </td>

                      {/* Variant ID (BOM Key) */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-md border border-emerald-300 dark:border-emerald-500/30 text-xs">
                            {variant.shopifyVariantId}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(variant.shopifyVariantId, variant.id);
                            }}
                            className="p-1.5 rounded-md text-slate-400 hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
                            title="Copy Variant ID"
                          >
                            {copiedId === variant.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                          </button>
                        </div>
                      </td>

                      {/* Price */}
                      <td className="py-3.5 px-5 font-bold font-mono text-[var(--text-primary)]">
                        {formatCurrency(variant.price)}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-5">
                        <span
                          className={`badge ${
                            product.status === "ACTIVE"
                              ? "badge-success"
                              : product.status === "DRAFT"
                              ? "badge-warning"
                              : "badge-neutral"
                          }`}
                        >
                          {product.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedVariant({ ...variant, product });
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-cyan-500/10 hover:border-cyan-500/40 text-[var(--text-primary)] hover:text-cyan-600 dark:hover:text-cyan-400 border border-[var(--border)] text-xs font-semibold transition-all cursor-pointer"
                        >
                          <Eye size={13} />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="p-4 sm:p-5 border-t border-[var(--border)] flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-[var(--surface-hover)] text-[var(--text-primary)] text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed border border-[var(--border)] transition-all cursor-pointer"
          >
            &larr; Previous
          </button>
          <span className="text-sm text-slate-500 font-medium">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-[var(--surface-hover)] text-[var(--text-primary)] text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed border border-[var(--border)] transition-all cursor-pointer"
          >
            Next &rarr;
          </button>
        </div>
      </div>

      {/* Drawer: Variant & BOM Inspector */}
      <Drawer
        isOpen={Boolean(selectedVariant)}
        onClose={() => setSelectedVariant(null)}
        width="max-w-xl"
        badge={
          <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-widest">
            Variant Inspector
          </span>
        }
        title={selectedVariant?.product?.title}
        footer={
          <button
            onClick={() => setSelectedVariant(null)}
            className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] text-sm font-semibold transition-all cursor-pointer"
          >
            Close Inspector
          </button>
        }
        contentClassName="p-6 space-y-6"
      >
        {selectedVariant && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-[var(--bg-secondary)]/60 border border-[var(--border)] space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Variant Title</span>
                <span className="font-semibold text-[var(--text-primary)]">{selectedVariant.title}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">SKU</span>
                <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
                  {selectedVariant.sku || "—"}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Price</span>
                <span className="font-mono font-bold text-[var(--text-primary)]">
                  {formatCurrency(selectedVariant.price)}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Shopify Variant ID</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                    {selectedVariant.shopifyVariantId}
                  </span>
                  <button
                    onClick={() => copyToClipboard(selectedVariant.shopifyVariantId, "drawer")}
                    className="text-slate-400 hover:text-[var(--text-primary)]"
                  >
                    {copiedId === "drawer" ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>
      </div>
    </RouteGuard>
  );
}
