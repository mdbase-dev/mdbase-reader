// Only the worker's initial HTML filename probes may fail on a clean-URL host.
// A successful canonical retry is verified separately through the installed cache.
export function unexpectedShellFailures(requests, origin) {
  return requests.filter(({ url, worker, error }) => {
    const request = new URL(url);
    if (request.origin !== origin) return false;
    return !(
      worker &&
      error === "net::ERR_FAILED" &&
      (request.href === origin + "/index.html" || request.href === origin + "/404.html")
    );
  });
}
