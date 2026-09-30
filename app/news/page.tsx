import { permanentRedirect } from "next/navigation";

export default function LegacyNewsIndex() {
  permanentRedirect("/blog");
}
