"use client";

import { useState } from "react";

export function NewTicketForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    requesterEmail: "",
    requesterName: "",
    category: "OTHER",
    urgency: "MEDIUM",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create");
      }
      setOpen(false);
      setForm({
        title: "",
        description: "",
        requesterEmail: "",
        requesterName: "",
        category: "OTHER",
        urgency: "MEDIUM",
      });
      onCreated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
      >
        + New ticket
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm"
    >
      <h2 className="mb-3 font-medium">Create ticket manually</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          required
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="rounded border border-[var(--border)] px-3 py-2 text-sm sm:col-span-2"
        />
        <input
          required
          type="email"
          placeholder="Requester email"
          value={form.requesterEmail}
          onChange={(e) => setForm({ ...form, requesterEmail: e.target.value })}
          className="rounded border border-[var(--border)] px-3 py-2 text-sm"
        />
        <input
          placeholder="Requester name"
          value={form.requesterName}
          onChange={(e) => setForm({ ...form, requesterName: e.target.value })}
          className="rounded border border-[var(--border)] px-3 py-2 text-sm"
        />
        <textarea
          required
          placeholder="Description"
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="rounded border border-[var(--border)] px-3 py-2 text-sm sm:col-span-2"
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border px-4 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
