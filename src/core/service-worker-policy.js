const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function shouldRegisterProductionServiceWorker(locationLike) {
  if (!locationLike || !["http:", "https:"].includes(locationLike.protocol)) return false;
  return !LOOPBACK_HOSTNAMES.has(locationLike.hostname.toLowerCase());
}
