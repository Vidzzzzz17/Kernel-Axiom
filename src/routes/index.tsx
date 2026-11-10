import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { KernelApp } from "@/components/kernel/KernelApp";
import { Backdrop } from "@/components/kernel/Backdrop";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kernel Axiom — a calm, local-first AI agent" },
      { name: "description", content: "Kernel Axiom plans, searches, reads and runs code for you, and asks before it changes anything. Everything stays on your device." },
      { property: "og:title", content: "Kernel Axiom — a calm, local-first AI agent" },
      { property: "og:description", content: "Plans, reads and runs code for you, and asks before it changes anything." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  // All data lives in IndexedDB, so the app renders on the client only.
  return (
    <ClientOnly fallback={<Backdrop />}>
      <KernelApp />
    </ClientOnly>
  );
}
