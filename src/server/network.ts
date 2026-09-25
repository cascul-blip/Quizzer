import { networkInterfaces } from "node:os";

export interface LanAddress {
  address: string;
  iface: string;
}

const VIRTUAL_IFACE = /docker|veth|^br-|virbr|vbox|virtualbox|vmnet|vmware|vethernet|hyper-v|wsl|tailscale|^zt|zerotier|^wg|wireguard|^tun|^tap|^utun|loopback/i;

function score(a: LanAddress): number {
  let s = 0;
  if (a.address.startsWith("192.168.")) s += 30;
  else if (a.address.startsWith("10.")) s += 20;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) s += 10;
  else if (a.address.startsWith("169.254.")) s -= 50; // link-local: no DHCP
  if (VIRTUAL_IFACE.test(a.iface)) s -= 40;
  if (/^(wl|wi-?fi|wlan|en|eth|ethernet)/i.test(a.iface)) s += 5;
  return s;
}

/** Non-internal IPv4 addresses, most likely LAN address first. */
export function lanAddresses(): LanAddress[] {
  const out: LanAddress[] = [];
  for (const [iface, infos] of Object.entries(networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family === "IPv4" && !info.internal) out.push({ address: info.address, iface });
    }
  }
  return out.sort((a, b) => score(b) - score(a));
}

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLoopbackAddress(ip: string | undefined | null): boolean {
  if (!ip) return false;
  return ip === "::1" || ip.startsWith("127.") || ip.startsWith("::ffff:127.");
}

function hostnameOf(hostHeaderOrUrl: string): string {
  try {
    return new URL(hostHeaderOrUrl.includes("://") ? hostHeaderOrUrl : `http://${hostHeaderOrUrl}`).hostname;
  } catch {
    return "";
  }
}

/**
 * Admin access = the request comes from this machine AND was addressed to a
 * loopback hostname (blocks DNS rebinding) AND, if sent by a browser page,
 * that page is itself served from loopback (blocks CSRF from other sites).
 */
export function isAdminRequest(remoteIp: string | undefined | null, headers: Headers): boolean {
  if (!isLoopbackAddress(remoteIp)) return false;
  const host = headers.get("host");
  if (host && !LOOPBACK_HOSTNAMES.has(hostnameOf(host))) return false;
  const origin = headers.get("origin");
  if (origin && !LOOPBACK_HOSTNAMES.has(hostnameOf(origin))) return false;
  return true;
}
