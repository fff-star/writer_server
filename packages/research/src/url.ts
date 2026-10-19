import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type AddressLookup = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  const [a = 0, b = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 0 && parts[2] === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && parts[2] === 100) ||
    (a === 203 && b === 0 && parts[2] === 113) ||
    a >= 224
  );
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80")
  );
}

export async function assertPublicHttpUrl(
  value: string,
  lookupAddress: AddressLookup = async (hostname) => {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return addresses.map((item) => ({ address: item.address, family: item.family }));
  },
): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only HTTP and HTTPS URLs are allowed");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Local network URLs are not allowed");
  }
  const ipVersion = isIP(hostname);
  if (ipVersion === 4 && isPrivateIPv4(hostname)) {
    throw new Error("Private network URLs are not allowed");
  }
  if (ipVersion === 6 && isPrivateIPv6(hostname)) {
    throw new Error("Private network URLs are not allowed");
  }
  if (ipVersion === 0) {
    const addresses = await lookupAddress(hostname);
    if (addresses.length === 0) {
      throw new Error(`Unable to resolve public host: ${hostname}`);
    }
    for (const address of addresses) {
      if (
        (address.family === 4 && isPrivateIPv4(address.address)) ||
        (address.family === 6 && isPrivateIPv6(address.address))
      ) {
        throw new Error(`Host resolves to a private address: ${hostname}`);
      }
    }
  }
  return url;
}
