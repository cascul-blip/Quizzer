import type { ClientMsg, PlayerView, ServerMsg } from "../../shared/protocol.ts";
import { applyPatch } from "../../shared/view-patch.ts";

interface PhoneScreenState {
  view: PlayerView | null;
  resumeVersion: number;
  joining: boolean;
  kicked: boolean;
  error: string | null;
}

export const initialPhoneScreen: PhoneScreenState = { view: null, resumeVersion: 0, joining: false, kicked: false, error: null };

interface PhoneSessionEffects {
  send(message: ClientMsg): void;
  saveToken(token: string | null): void;
  preloadImages(images: string[]): void;
  show(state: PhoneScreenState): void;
}

export class PhoneSession {
  private screen = initialPhoneScreen;
  private patchBaseline: PlayerView | null = null;
  private resuming = false;

  constructor(private readonly effects: PhoneSessionEffects) {}

  open(token: string | null): void {
    this.patchBaseline = null;
    this.resuming = Boolean(token);
    if (token) {
      if (this.screen.view?.kind === "none") this.show({ view: null });
      this.effects.send({ type: "resume", token });
    }
  }

  join(message: Extract<ClientMsg, { type: "join" }>): void {
    this.show({ joining: true });
    this.effects.send(message);
  }

  dismissKick(): void {
    this.show({ kicked: false });
  }

  dismissError(): void {
    this.show({ error: null });
  }

  receive(message: ServerMsg): void {
    switch (message.type) {
      case "player.state":
        return this.updateView(message.view);
      case "player.patch":
        if (this.patchBaseline) this.updateView(applyPatch(this.patchBaseline, message.ops));
        return;
      case "joined":
        this.effects.saveToken(message.token);
        this.effects.preloadImages(message.images ?? []);
        return;
      case "resumeFailed":
        this.resuming = false;
        this.effects.saveToken(null);
        this.show({ view: this.patchBaseline, joining: false });
        return;
      case "kicked":
        this.resuming = false;
        this.effects.saveToken(null);
        this.show({ view: null, kicked: true, joining: false });
        return;
      case "error":
        this.show({ error: message.message, joining: false });
    }
  }

  private updateView(view: PlayerView): void {
    this.patchBaseline = view;
    const resumed = this.resuming && view.kind !== "none";
    if (resumed) this.resuming = false;
    this.show({
      view: this.resuming ? this.screen.view : view,
      resumeVersion: this.screen.resumeVersion + (resumed ? 1 : 0),
      joining: false,
    });
  }

  private show(update: Partial<PhoneScreenState>): void {
    this.screen = { ...this.screen, ...update };
    this.effects.show(this.screen);
  }
}
