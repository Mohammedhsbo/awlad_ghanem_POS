const url = process.argv[2] ?? process.env.HEALTHCHECK_URL ?? "http://localhost:3000/health/ready";

const response = await fetch(url).catch((error) => {
  console.error(error);
  process.exit(1);
});

if (!response.ok) {
  console.error(`Health check failed: ${response.status} ${response.statusText}`);
  process.exit(1);
}

console.log(`Health check passed: ${url}`);
