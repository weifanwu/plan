/* global chrome */

(() => {
  if (globalThis.__MAP_JOB_CAPTURE_BRIDGE__) return;
  globalThis.__MAP_JOB_CAPTURE_BRIDGE__ = true;
  const STORAGE_KEY = "pendingMapJobCapture";
  let pendingCapture = null;

  async function readPendingCapture() {
    if (pendingCapture) return pendingCapture;
    const stored = await chrome.storage.session.get(STORAGE_KEY);
    pendingCapture = stored[STORAGE_KEY] || null;
    return pendingCapture;
  }

  async function deliver() {
    const capture = await readPendingCapture();
    if (!capture) return;
    window.postMessage({
      source: "map-job-capture-extension",
      type: "MAP_JOB_CAPTURE",
      captureId: capture.captureId,
      action: capture.action,
      payload: capture.application,
    }, window.location.origin);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "DELIVER_MAP_JOB_CAPTURE" || !message.capture) return;
    pendingCapture = message.capture;
    void deliver();
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (event.data?.source === "map-app" && event.data?.type === "MAP_APP_READY") void deliver();
    if (event.data?.source === "map-app" && event.data?.type === "MAP_JOB_CAPTURE_ACK" && event.data?.captureId === pendingCapture?.captureId) {
      pendingCapture = null;
      void chrome.storage.session.remove(STORAGE_KEY);
    }
  });

  void deliver();
  window.setTimeout(() => { void deliver(); }, 700);
  window.setTimeout(() => { void deliver(); }, 1800);
})();
