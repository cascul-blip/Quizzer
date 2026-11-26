import QRCode from "qrcode";
import type { JoinInfo } from "../shared/protocol.ts";
import type { LanAddress } from "./network.ts";
import { lanAddressesMostLikelyFirst } from "./network.ts";

const ADDRESS_TTL_MS = 5000;

export interface JoinInfoOptions {
  forcedAddress?: string;
  discoverAddresses?: () => LanAddress[];
  now?: () => number;
  log?: (msg: string) => void;
  onQrReady?: () => void;
}

export class JoinInformation {
  port = 0;
  private selected: string | null;
  private addressCache: { at: number; list: LanAddress[] } | null = null;
  private qrByUrl = new Map<string, string>();

  constructor(private readonly opts: JoinInfoOptions = {}) {
    this.selected = opts.forcedAddress ?? null;
  }

  addresses(): LanAddress[] {
    const now = (this.opts.now ?? Date.now)();
    if (!this.addressCache || now - this.addressCache.at > ADDRESS_TTL_MS) {
      this.addressCache = { at: now, list: (this.opts.discoverAddresses ?? lanAddressesMostLikelyFirst)() };
    }
    return this.addressCache.list;
  }

  get address(): string {
    if (this.selected && this.isUsable(this.selected)) return this.selected;
    return this.addresses()[0]?.address ?? "localhost";
  }

  // why: an address that isn't one of this computer's is refused, keeping the previous choice.
  select(address: string): boolean {
    if (!this.isUsable(address)) return false;
    this.selected = address;
    return true;
  }

  private isUsable(address: string): boolean {
    return address === this.opts.forcedAddress || this.addresses().some((a) => a.address === address);
  }

  url(): string {
    return `http://${this.address}:${this.port}/`;
  }

  // why: qrSvg is "" until rendering completes; onQrReady fires then.
  info(): JoinInfo {
    const url = this.url();
    let qrSvg = this.qrByUrl.get(url);
    if (qrSvg === undefined) {
      this.qrByUrl.set(url, "");
      QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
        .then((svg) => {
          this.qrByUrl.set(url, svg);
          this.opts.onQrReady?.();
        })
        .catch((e) => this.opts.log?.(`QR code generation failed: ${e}`));
      qrSvg = "";
    }
    const addresses = this.addresses().map(({ address, iface }) => ({ address, iface }));
    const forced = this.opts.forcedAddress;
    if (forced && !addresses.some((a) => a.address === forced)) addresses.unshift({ address: forced, iface: "--host" });
    return { url, qrSvg, address: this.address, addresses, port: this.port };
  }
}
