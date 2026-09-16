import { cn } from "@/lib/utils";
import logoAsset from "@/assets/aawb-wordmark.png.asset.json";

export function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src={logoAsset.url}
      alt="Logo AAWB"
      width={2000}
      height={1200}
      loading="eager"
      decoding="async"
      className={cn("h-11 w-auto object-contain", className)}
    />
  );
}
