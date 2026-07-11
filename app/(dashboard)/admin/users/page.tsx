"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

type UserRow = {
  id: string;
  username: string | null;
  name: string | null;
  email: string;
  role: "admin" | "user";
  active: boolean;
  createdAt: string;
};

const emptyForm = { username: "", name: "", password: "", role: "user" as "admin" | "user" };

export default function UsersAdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({ name: "", role: "user" as "admin" | "user", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to create user");
      return;
    }
    setForm(emptyForm);
    load();
  };

  const saveEdit = async () => {
    if (!editing) return;
    setError(null);
    const body: Record<string, string> = {
      name: editForm.name,
      role: editForm.role,
    };
    if (editForm.password) body.password = editForm.password;
    const res = await fetch(`/api/users/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to update");
      return;
    }
    setEditing(null);
    load();
  };

  const toggleActive = async (user: UserRow) => {
    setError(null);
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !user.active }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to update");
      return;
    }
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--primary)]">Users</h1>
        <p className="text-sm text-[var(--muted)]">Create and manage LegalQ accounts</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <Card title="Add user">
        <form onSubmit={createUser} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />
          <Input
            placeholder="Display name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "user" })}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            <option value="user">Viewer</option>
            <option value="admin">Admin</option>
          </select>
          <Button type="submit">Create</Button>
        </form>
      </Card>

      <Card title="All users">
        {loading ? (
          <p className="text-[var(--muted)]">Loading...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted)]">
                  <th className="pb-2 pr-3 font-medium">Name</th>
                  <th className="pb-2 pr-3 font-medium">Username</th>
                  <th className="pb-2 pr-3 font-medium">Role</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2.5 pr-3">{u.name}</td>
                    <td className="py-2.5 pr-3">{u.username}</td>
                    <td className="py-2.5 pr-3">
                      <Badge variant={u.role === "admin" ? "urgent" : "default"}>{u.role}</Badge>
                    </td>
                    <td className="py-2.5 pr-3">{u.active ? "Active" : "Inactive"}</td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditing(u);
                            setEditForm({
                              name: u.name ?? "",
                              role: u.role,
                              password: "",
                            });
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={u.active ? "danger" : "secondary"}
                          onClick={() => toggleActive(u)}
                        >
                          {u.active ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card title={`Edit ${editing.username}`} className="w-full max-w-md">
            <div className="space-y-3">
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Display name"
              />
              <select
                value={editForm.role}
                onChange={(e) =>
                  setEditForm({ ...editForm, role: e.target.value as "admin" | "user" })
                }
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <option value="user">Viewer</option>
                <option value="admin">Admin</option>
              </select>
              <Input
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                placeholder="New password (optional)"
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="button" onClick={saveEdit}>
                  Save
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
