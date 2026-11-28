// Schedule the next request after the previous one finishes.
export function pollWhileVisible(poll: (signal: AbortSignal) => Promise<void>, delay: number) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;

  async function run() {
    if (pending || document.hidden || controller.signal.aborted) return;
    pending = true;
    try {
      await poll(controller.signal);
    } catch {
      // Transient failures retry on the next poll.
    } finally {
      pending = false;
      if (!document.hidden && !controller.signal.aborted) timer = setTimeout(run, delay);
    }
  }

  function onVisibility() {
    clearTimeout(timer);
    if (!document.hidden) void run();
  }

  document.addEventListener("visibilitychange", onVisibility);
  void run();
  return () => {
    controller.abort();
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
