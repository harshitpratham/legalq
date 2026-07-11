"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";

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
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;

    setLoading(true);
    setError(null);
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
      setError(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border-t border-[var(--border)] pt-4">
      <label className="block text-sm font-medium">Reply to requester</label>
      <p className="text-xs text-[var(--muted)]">
        Your reply appears in the conversation and emails {requesterEmail} when notification is
        enabled.
      </p>
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={4}
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={loading || !comment.trim()}>
        {loading ? "Sending..." : sendToStakeholder ? "Reply & notify" : "Reply (internal only)"}
      </Button>
    </form>
  );
}
