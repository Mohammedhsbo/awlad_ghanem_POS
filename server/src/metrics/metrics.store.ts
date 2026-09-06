type RouteKey = `${string} ${string} ${number}`;

const startedAt = Date.now();
const httpRequests = new Map<RouteKey, { count: number; totalDurationMs: number }>();

export function recordHttpRequest(method: string, path: string, statusCode: number, durationMs: number) {
  const key: RouteKey = `${method} ${path} ${statusCode}`;
  const current = httpRequests.get(key) ?? { count: 0, totalDurationMs: 0 };
  current.count += 1;
  current.totalDurationMs += durationMs;
  httpRequests.set(key, current);
}

function metricName(input: string) {
  return input.replace(/[^a-zA-Z0-9_]/g, "_");
}

export function renderPrometheusMetrics() {
  const lines = [
    "# HELP motorcycle_api_uptime_seconds API process uptime.",
    "# TYPE motorcycle_api_uptime_seconds gauge",
    `motorcycle_api_uptime_seconds ${Math.floor((Date.now() - startedAt) / 1000)}`,
    "# HELP motorcycle_api_http_requests_total HTTP requests by method, route, and status.",
    "# TYPE motorcycle_api_http_requests_total counter",
    "# HELP motorcycle_api_http_request_duration_ms_sum Total HTTP request duration.",
    "# TYPE motorcycle_api_http_request_duration_ms_sum counter",
  ];

  for (const [key, value] of httpRequests) {
    const [method, path, statusCode] = key.split(" ");
    const labels = `method="${method}",route="${metricName(path)}",status="${statusCode}"`;
    lines.push(`motorcycle_api_http_requests_total{${labels}} ${value.count}`);
    lines.push(`motorcycle_api_http_request_duration_ms_sum{${labels}} ${value.totalDurationMs}`);
  }

  return `${lines.join("\n")}\n`;
}
