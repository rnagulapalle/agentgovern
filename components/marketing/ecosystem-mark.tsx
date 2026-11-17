import Image from "next/image";
import icons from "@/lib/ecosystem-icons.json";

export type EcosystemIcon = keyof typeof icons;
/** Locally bundled brand artwork, never a remote tracking image or live status. */
export function EcosystemMark({ name }: { name: EcosystemIcon }) {
  const icon = icons[name];
  return <span className="clarity-brand-mark" title={icon.name} data-brand={name} style={{ color: `#${icon.hex}` }}>
    {"nativeAsset" in icon && typeof icon.nativeAsset === "string" ? <Image src={icon.nativeAsset} alt={icon.name} aria-label={icon.name} width={32} height={32} unoptimized /> : (
    <svg viewBox="0 0 24 24" role="img" aria-label={icon.name} focusable="false">
      <title>{icon.name}</title>
      {icon.paths.map((d, i) => <path key={i} d={d} />)}
    </svg>)}
  </span>;
}
