"use client";

import { useState } from "react";

export function CommentBox({
  ticketId,
  requesterEmail,
  onSent,
}: {
  ticketId: string;
  requesterEmail: string;
  onSent: () => void;
}) {
  const [comment, setComment] = useState("");
  const [sendToStakeholder, setSendToStakeholder] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: comment.trim(), sendToStakeholder }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to send");
      }
      setComment("");
      onSent();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border-t border-[var(--border)] pt-4">
      <label className="block text-sm font-medium">Reply to requester</label>
      <p className="text-xs text-[var(--muted)]">
        Your reply appears in the conversation and emails {requesterEmail} when notification is enabled.
      </p>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={4}
        className="w-full rounded-lg border border-[var(--border)] p-3 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
        placeholder="e.g. We are reviewing your NDA extension and will update you by Friday."
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={sendToStakeholder}
          onChange={(e) => setSendToStakeholder(e.target.checked)}
        />
        Send email notification to requester
      </label>
      <button
        type="submit"
        disabled={loading || !comment.trim()}
        className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
      >
        {loading ? "Sending..." : sendToStakeholder ? "Reply & notify" : "Reply (internal only)"}
      </button>
    </form>
  );
}
