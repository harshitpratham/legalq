/**
 * Server boot hook — starts a background Gmail inbox poller so tickets are
 * created even when Pub/Sub push fails or lags.
 *
 * Calls POST /api/cron/gmail-sync over HTTP (same as GitHub Actions backup)
 * so this file never imports Node-only modules like `crypto` (which break
 * the Next.js webpack build when instrumentation is analyzed).
 *
 * Runs only in the Node.js runtime of a long-lived `next start` process
 * (e.g. Railway). Skipped during build and on the Edge runtime.
 */

const SYNC_INTERVAL_MS = 3 * 60 * 1000;
const BOOT_DELAY_MS = 15 * 1000;

function syncUrl(): string {
  const base =
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    (process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : "http://127.0.0.1:3000");
  return `${base}/api/cron/gmail-sync`;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_GMAIL_POLLER === "1") return;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn("[gmail-poller] CRON_SECRET not set — poller disabled");
    return;
  }

  // Avoid double-start under Next.js HMR / multiple register() calls.
  const g = globalThis as typeof globalThis & {
    __legalqGmailPollerStarted?: boolean;
  };
  if (g.__legalqGmailPollerStarted) return;
  g.__legalqGmailPollerStarted = true;

  let running = false;

  const runSync = async (reason: string) => {
    if (running) {
      console.log(`[gmail-poller] skip overlapping run (${reason})`);
      return;
    }
    running = true;
    try {
      const res = await fetch(syncUrl(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
          "Content-Type": "application/json",
        },
      });
      const body = (await res.json().catch(() => ({}))) as {
        processed?: number;
        skipped?: number;
        error?: string;
      };
      if (!res.ok) {
        console.error(`[gmail-poller] ${reason} HTTP ${res.status}:`, body);
      } else {
        console.log(
          `[gmail-poller] ${reason}: processed=${body.processed ?? 0} skipped=${body.skipped ?? 0}` +
            (body.error ? ` error=${body.error}` : "")
        );
      }
    } catch (err) {
      console.error(`[gmail-poller] ${reason} failed:`, err);
    } finally {
      running = false;
    }
  };

  console.log(
    `[gmail-poller] starting (boot delay ${BOOT_DELAY_MS / 1000}s, interval ${SYNC_INTERVAL_MS / 1000}s)`
  );

  setTimeout(() => {
    void runSync("boot");
  }, BOOT_DELAY_MS);

  setInterval(() => {
    void runSync("interval");
  }, SYNC_INTERVAL_MS);
}
