import type { ModeProtocol } from "../src/shared/shared-mode-entry.ts";
import { sharedModeEntry } from "../src/shared/shared-mode-entry.ts";

type SampleMessage = { type: "sample.answer" } | { type: "sample.move" };
type SampleView = { kind: "sample"; phase: "playing" };
type SampleProtocol = ModeProtocol<SampleMessage, { rounds: number }, SampleView, SampleView>;

const entry = {
  name: "Sample",
  flags: { paced: false, protect: false },
  lobbyBanner: false,
} as const;

sharedModeEntry<SampleProtocol>()({ ...entry, msgTypes: ["sample.answer", "sample.move"] });

// @ts-expect-error The entry must list every gameplay message.
sharedModeEntry<SampleProtocol>()({ ...entry, msgTypes: ["sample.answer"] });

// @ts-expect-error The entry must supply a stored settings type.
sharedModeEntry<Omit<SampleProtocol, "settings">>();

// @ts-expect-error The entry must supply a host view.
sharedModeEntry<Omit<SampleProtocol, "hostView">>();

// @ts-expect-error The entry must supply a phone view.
sharedModeEntry<Omit<SampleProtocol, "playerView">>();
