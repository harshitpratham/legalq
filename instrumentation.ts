/**
 * Server boot hook — starts a background Gmail inbox poller so tickets are
 * created even when Pub/Sub push fails or lags.
 *
 * Runs only in the Node.js runtime of a long-lived `next start` process
 * (e.g. Railway). Skipped during build and on the Edge runtime.
 */

const SYNC_INTERVAL_MS = 3 * 60 * 1000;
const BOOT_DELAY_MS = 15 * 1000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_GMAIL_POLLER === "1") return;

  // Avoid double-start under Next.js HMR / multiple register() calls.
  const g = globalThis as typeof globalThis & {
    __legalqGmailPollerStarted?: boolean;
  };
  if (g.__legalqGmailPollerStarted) return;
  g.__legalqGmailPollerStarted = true;

  const { syncGmailInbox } = await import("@/lib/email/gmailSync");

  let running = false;

  const runSync = async (reason: string) => {
    if (running) {
      console.log(`[gmail-poller] skip overlapping run (${reason})`);
      return;
    }
    running = true;
    try {
      const result = await syncGmailInbox();
      console.log(
        `[gmail-poller] ${reason}: processed=${result.processed ?? 0} skipped=${result.skipped ?? 0}` +
          (result.error ? ` error=${result.error}` : "")
      );
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
