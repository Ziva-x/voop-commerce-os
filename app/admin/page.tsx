import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { AdminLoginForm } from "./AdminLoginForm";

export default async function AdminPage() {
  const cookieStore = cookies();
  const isAdmin = cookieStore.get("adminAuth")?.value === "true";

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-4 text-white">
        <div className="max-w-sm w-full glass-panel p-6">
          <h1 className="text-xl font-bold mb-4">Admin Login</h1>
          <AdminLoginForm />
        </div>
      </div>
    );
  }

  const users = await prisma.user.findMany({
    include: {
      store: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-white p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-sky-400">Super Admin Dashboard</h1>
          <span className="text-sm text-slate-400">Total Users: {users.length}</span>
        </div>

        <div className="glass-panel overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-800/50 text-slate-300">
              <tr>
                <th className="p-4 font-medium">User Name</th>
                <th className="p-4 font-medium">Email</th>
                <th className="p-4 font-medium">Shopify Store</th>
                <th className="p-4 font-medium">Created At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-[var(--surface-hover)]/20 transition-colors">
                  <td className="p-4 font-medium text-white">{user.name}</td>
                  <td className="p-4 text-slate-400">{user.email}</td>
                  <td className="p-4">
                    {!user.store ? (
                      <span className="text-slate-500 italic">No Store Linked</span>
                    ) : (
                      <span className="text-sky-400">
                        {user.store.storeName || user.store.shopDomain}
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-slate-400 text-xs whitespace-nowrap">
                    {new Date(user.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500">
                    No accounts created yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
