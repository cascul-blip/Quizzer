import { useState } from "preact/hooks";
import { ACCESSORIES, AVATARS, type AvatarChoice } from "../../shared/avatars.ts";
import { Avatar } from "../shared/avatar-art.tsx";

/** Lobby picker: a Character tab and an Accessory tab, each a grid previewing the option on the current look. */
export function AvatarPicker({ value, onPick }: { value: AvatarChoice; onPick: (choice: AvatarChoice) => void }) {
  const [tab, setTab] = useState<"avatar" | "accessory">("avatar");
  const options =
    tab === "avatar"
      ? AVATARS.map((a) => ({ id: a.id, name: a.name, choice: { ...value, avatar: a.id }, selected: a.id === value.avatar }))
      : ACCESSORIES.map((a) => ({ id: a.id, name: a.name, choice: { ...value, accessory: a.id }, selected: a.id === value.accessory }));
  return (
    <section class="avatar-picker card">
      <div class="picker-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "avatar"} class={tab === "avatar" ? "on" : ""} onClick={() => setTab("avatar")}>
          Character
        </button>
        <button role="tab" aria-selected={tab === "accessory"} class={tab === "accessory" ? "on" : ""} onClick={() => setTab("accessory")}>
          Accessory
        </button>
      </div>
      <div class="picker-grid">
        {options.map((o) => (
          <button
            key={o.id}
            class={`picker-tile ${o.selected ? "on" : ""}`}
            aria-pressed={o.selected}
            title={o.name}
            onClick={() => {
              if (navigator.vibrate) navigator.vibrate(15);
              onPick(o.choice);
            }}
          >
            {tab === "accessory" && o.id === "none" ? <span class="none-tile">None</span> : <Avatar choice={o.choice} title={o.name} />}
          </button>
        ))}
      </div>
    </section>
  );
}
