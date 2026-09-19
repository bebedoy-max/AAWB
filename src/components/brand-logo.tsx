import { cn } from "@/lib/utils";

// Logo disajikan dari folder public agar tetap termuat di hosting mana pun
// (Lovable, Cloudflare, Vercel, VPS) tanpa bergantung pada CDN eksternal.
const LOGO_URL = "/narowa-wordmark.png";

export function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src={LOGO_URL}
      alt="Logo NAROWA"
      width={800}
      height={480}
      loading="eager"
      decoding="async"
      className={cn("h-11 w-auto object-contain", className)}
    />
  );
}
