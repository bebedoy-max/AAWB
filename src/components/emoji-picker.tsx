import { useState } from "react";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const GROUPS: Array<{ label: string; emojis: string[] }> = [
  {
    label: "Wajah",
    emojis: [
      "😀","😁","😂","🤣","😊","😍","😘","😉","😎","🤩","🥳","😇","🙂","🤗","🤔","😴",
      "😅","😭","😢","😡","😱","🤯","😬","🙃","😌","🥰","😋","🤤","🤭","🫶",
    ],
  },
  {
    label: "Tangan & Orang",
    emojis: ["👍","👎","👏","🙏","💪","✌️","🤝","👌","🫰","👋","🙌","☝️","✍️","🧑‍💻","👨‍👩‍👧","🤵","👑"],
  },
  {
    label: "Bisnis & Promo",
    emojis: [
      "🔥","✨","⭐","🎉","🎊","🎁","💰","💵","💳","🏷️","🛒","🛍️","📦","🚚","📢","📣","📌","✅","❗","⚡",
      "📈","💯","🆕","🆓","⏰","🗓️","🎯","🔔","💬","📝",
    ],
  },
  {
    label: "Objek",
    emojis: ["📱","💻","📷","🎥","🎵","📄","📎","🔗","🌐","📍","🏠","🏢","☕","🍔","🍕","✈️","❤️","💚","💙","🧡"],
  },
];

export function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="secondary">
          <Smile className="mr-1 size-3.5" /> Emoji
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[290px] p-2" align="start">
        <div className="max-h-72 space-y-3 overflow-y-auto">
          {GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1 px-1 text-xs font-medium text-muted-foreground">{group.label}</p>
              <div className="grid grid-cols-8 gap-0.5">
                {group.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onSelect(emoji)}
                    className="rounded-md p-1 text-lg leading-none hover:bg-muted"
                    aria-label={`Sisipkan ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
