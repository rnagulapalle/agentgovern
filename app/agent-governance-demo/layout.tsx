import { redirect } from "next/navigation";

// The demo page.tsx is a client component and can't export metadata, so the
// route's SEO (incl. a self-canonical) is set here on the server layout —
// otherwise it inherits the root layout's canonical "/" and Google folds the
// demo into the homepage instead of indexing it.
export default function DemoLayout() {
  redirect("/control-plane");
}
