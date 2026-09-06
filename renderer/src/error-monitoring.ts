const endpoint = import.meta.env.VITE_ERROR_MONITORING_DSN;

function reportClientError(kind: string, payload: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    service: "desktop",
    environment: import.meta.env.MODE,
    version: import.meta.env.VITE_APP_VERSION,
    kind,
    ...payload,
  };
  console.error(JSON.stringify(entry));
  if (endpoint) {
    void fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
      keepalive: true,
    }).catch(() => undefined);
  }
}

export function installErrorMonitoring() {
  window.addEventListener("error", (event) => {
    reportClientError("error", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportClientError("unhandledrejection", {
      reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
    });
  });
}
