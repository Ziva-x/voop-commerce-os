"use client";

import { useState, useEffect } from "react";
import { Users, Plus, X, Trash2, Edit3, Shield, Check } from "lucide-react";
import { appFetch } from "@/lib/api";
import { PERMISSION_MODULE_GROUPS, normalizeUserPermissions } from "@/lib/permissions";

interface StaffMember {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  permissions: string | null;
  createdAt: string;
}

export default function StaffTab({ userRole }: { userRole: string }) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    permissions: [] as string[],
  });

  const [editPermissions, setEditPermissions] = useState<string[]>([]);

  const fetchStaff = async () => {
    if (userRole !== "ADMIN") {
      setLoading(false);
      return;
    }

    try {
      const res = await appFetch("/api/admin/staff");
      const data = await res.json();
      if (data.success) {
        setStaff(data.staff);
      } else {
        setErrorMsg(data.error || "Failed to load staff");
      }
    } catch (error) {
      setErrorMsg("An error occurred while loading staff.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, [userRole]);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg("");
    try {
      const res = await appFetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMsg("Staff account created successfully!");
        setTimeout(() => setSuccessMsg(""), 3000);
        setShowCreateModal(false);
        setFormData({ name: "", email: "", password: "", permissions: [] });
        fetchStaff();
      } else {
        setErrorMsg(data.error || "Failed to create staff account.");
      }
    } catch (error) {
      setErrorMsg("An error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStaffPermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;
    setIsSubmitting(true);
    setErrorMsg("");
    try {
      const res = await appFetch("/api/admin/staff", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingStaff.id,
          permissions: editPermissions,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMsg(`Permissions updated for ${editingStaff.name}`);
        setTimeout(() => setSuccessMsg(""), 3000);
        setEditingStaff(null);
        fetchStaff();
      } else {
        setErrorMsg(data.error || "Failed to update staff permissions.");
      }
    } catch (error) {
      setErrorMsg("An error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteStaff = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove staff member "${name}"?`)) return;

    try {
      const res = await appFetch(`/api/admin/staff?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMsg(`Staff member ${name} removed.`);
        setTimeout(() => setSuccessMsg(""), 3000);
        fetchStaff();
      } else {
        setErrorMsg(data.error || "Failed to delete staff member.");
      }
    } catch (error) {
      setErrorMsg("An error occurred.");
    }
  };

  const toggleCreatePermission = (key: string) => {
    setFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter((p) => p !== key)
        : [...prev.permissions, key],
    }));
  };

  const toggleEditPermission = (key: string) => {
    setEditPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const toggleModuleInCreate = (keys: string[]) => {
    const allSelected = keys.every((k) => formData.permissions.includes(k));
    setFormData((prev) => ({
      ...prev,
      permissions: allSelected
        ? prev.permissions.filter((p) => !keys.includes(p))
        : Array.from(new Set([...prev.permissions, ...keys])),
    }));
  };

  const toggleModuleInEdit = (keys: string[]) => {
    const allSelected = keys.every((k) => editPermissions.includes(k));
    setEditPermissions((prev) =>
      allSelected
        ? prev.filter((p) => !keys.includes(p))
        : Array.from(new Set([...prev, ...keys]))
    );
  };

  const startEdit = (s: StaffMember) => {
    setEditingStaff(s);
    setEditPermissions(normalizeUserPermissions(s.permissions));
  };

  if (userRole !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="bg-red-50 text-red-600 p-4 rounded-full mb-4">
          <Users className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-medium text-gray-900">Access Restricted</h3>
        <p className="mt-2 text-sm text-gray-500 max-w-sm">
          Only store administrators can view and manage staff accounts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-medium text-gray-900 flex items-center">
            <Users className="w-5 h-5 mr-2 text-cyan-600" />
            Staff Management
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Add and manage staff members and their granular section permissions.
          </p>
        </div>
        <button
          onClick={() => {
            setFormData({ name: "", email: "", password: "", permissions: [] });
            setShowCreateModal(true);
          }}
          className="flex items-center px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 text-sm font-medium shadow-sm transition"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Staff
        </button>
      </div>

      {errorMsg && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center justify-between text-sm">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg("")}><X className="w-4 h-4" /></button>
        </div>
      )}

      {successMsg && (
        <div className="bg-green-50 text-green-600 p-4 rounded-lg flex items-center justify-between text-sm">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg("")}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading staff...</div>
        ) : staff.length === 0 ? (
          <div className="p-12 text-center text-gray-500 flex flex-col items-center">
            <Users className="w-12 h-12 text-gray-300 mb-4" />
            <p className="font-medium text-gray-700">No staff members found.</p>
            <p className="text-sm mt-1">Create staff accounts to grant team members restricted access.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Permissions</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {staff.map((s) => {
                  const perms = normalizeUserPermissions(s.permissions);
                  return (
                    <tr key={s.id} className="hover:bg-gray-50/70 transition">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-cyan-100 text-cyan-800 rounded-full flex items-center justify-center font-bold">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-semibold text-gray-900">{s.name}</div>
                            <div className="text-xs text-gray-500">{s.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-0.5 inline-flex text-xs font-semibold rounded-full ${s.role === "ADMIN" ? "bg-purple-100 text-purple-800" : "bg-emerald-100 text-emerald-800"}`}>
                          {s.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {s.role === "ADMIN" ? (
                          <span className="text-xs text-purple-700 font-medium">All Store Access (Admin)</span>
                        ) : perms.length === 0 ? (
                          <span className="text-xs text-red-500 font-medium italic">No permissions assigned</span>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-md">
                            {perms.slice(0, 5).map((p) => (
                              <span key={p} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-mono">
                                {p}
                              </span>
                            ))}
                            {perms.length > 5 && (
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px]">
                                +{perms.length - 5} more
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(s.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        {s.role !== "ADMIN" && (
                          <>
                            <button
                              onClick={() => startEdit(s)}
                              className="text-cyan-600 hover:text-cyan-900 p-1 rounded hover:bg-cyan-50 transition"
                              title="Edit Permissions"
                            >
                              <Edit3 className="w-4 h-4 inline" />
                            </button>
                            <button
                              onClick={() => handleDeleteStaff(s.id, s.name)}
                              className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50 transition"
                              title="Delete Staff"
                            >
                              <Trash2 className="w-4 h-4 inline" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE STAFF MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <div className="flex items-center space-x-2">
                <div className="w-9 h-9 rounded-lg bg-cyan-50 flex items-center justify-center text-cyan-600 font-bold">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Add New Staff Member</h3>
                  <p className="text-xs text-gray-500">Create an account and assign specific section permissions</p>
                </div>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-cyan-500 outline-hidden"
                    placeholder="e.g. John Doe"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-cyan-500 outline-hidden"
                    placeholder="john@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-cyan-500 outline-hidden"
                  placeholder="Minimum 6 characters"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Access Permissions by Module
                  </label>
                  <span className="text-xs text-cyan-600 font-medium">
                    {formData.permissions.length} permissions selected
                  </span>
                </div>

                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {PERMISSION_MODULE_GROUPS.map((group) => {
                    const groupKeys = group.permissions.map((p) => p.key);
                    const allChecked = groupKeys.every((k) => formData.permissions.includes(k));
                    const someChecked = groupKeys.some((k) => formData.permissions.includes(k));

                    return (
                      <div key={group.moduleId} className="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                        <div className="flex items-center justify-between mb-2">
                          <label className="flex items-center space-x-2 cursor-pointer font-semibold text-xs text-gray-900">
                            <input
                              type="checkbox"
                              checked={allChecked}
                              ref={(el) => {
                                if (el) el.indeterminate = someChecked && !allChecked;
                              }}
                              onChange={() => toggleModuleInCreate(groupKeys)}
                              className="rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                            />
                            <span>{group.moduleName}</span>
                          </label>
                          <span className="text-[11px] text-gray-400">Select All</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-5">
                          {group.permissions.map((perm) => (
                            <label key={perm.key} className="flex items-start space-x-2 text-xs text-gray-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={formData.permissions.includes(perm.key)}
                                onChange={() => toggleCreatePermission(perm.key)}
                                className="rounded border-gray-300 text-cyan-600 focus:ring-cyan-500 mt-0.5"
                              />
                              <div>
                                <span className="font-medium text-gray-800">{perm.label}</span>
                                <p className="text-[10px] text-gray-500 leading-tight">{perm.description}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 flex justify-end space-x-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 transition shadow-sm"
                >
                  {isSubmitting ? "Creating..." : "Create Staff Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PERMISSIONS MODAL */}
      {editingStaff && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <div className="flex items-center space-x-2">
                <div className="w-9 h-9 rounded-lg bg-cyan-50 flex items-center justify-center text-cyan-600 font-bold">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Edit Permissions — {editingStaff.name}</h3>
                  <p className="text-xs text-gray-500">{editingStaff.email}</p>
                </div>
              </div>
              <button onClick={() => setEditingStaff(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateStaffPermissions} className="p-6 space-y-5">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Assigned Module Permissions
                  </label>
                  <span className="text-xs text-cyan-600 font-medium">
                    {editPermissions.length} permissions active
                  </span>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {PERMISSION_MODULE_GROUPS.map((group) => {
                    const groupKeys = group.permissions.map((p) => p.key);
                    const allChecked = groupKeys.every((k) => editPermissions.includes(k));
                    const someChecked = groupKeys.some((k) => editPermissions.includes(k));

                    return (
                      <div key={group.moduleId} className="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                        <div className="flex items-center justify-between mb-2">
                          <label className="flex items-center space-x-2 cursor-pointer font-semibold text-xs text-gray-900">
                            <input
                              type="checkbox"
                              checked={allChecked}
                              ref={(el) => {
                                if (el) el.indeterminate = someChecked && !allChecked;
                              }}
                              onChange={() => toggleModuleInEdit(groupKeys)}
                              className="rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                            />
                            <span>{group.moduleName}</span>
                          </label>
                          <span className="text-[11px] text-gray-400">Toggle All</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-5">
                          {group.permissions.map((perm) => (
                            <label key={perm.key} className="flex items-start space-x-2 text-xs text-gray-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editPermissions.includes(perm.key)}
                                onChange={() => toggleEditPermission(perm.key)}
                                className="rounded border-gray-300 text-cyan-600 focus:ring-cyan-500 mt-0.5"
                              />
                              <div>
                                <span className="font-medium text-gray-800">{perm.label}</span>
                                <p className="text-[10px] text-gray-500 leading-tight">{perm.description}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 flex justify-end space-x-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 transition shadow-sm flex items-center space-x-1"
                >
                  <Check className="w-4 h-4 mr-1" />
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
