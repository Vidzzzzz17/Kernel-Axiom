import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ArrowLeft, Monitor, Smartphone, Globe } from "lucide-react";
import { Backdrop } from "@/components/kernel/Backdrop";
import { Orb } from "@/components/kernel/Orb";
import { KButton, spring } from "@/components/kernel/ui";

import windowsBuild from "@/assets/downloads/KernelAxiom-Windows-x64.zip.asset.json";

const WINDOWS_URL = windowsBuild.url;
const WINDOWS_SIZE_MB = Math.round(windowsBuild.size / 1_000_000);

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download Kernel Axiom for Windows, iPhone and Android" },
      { name: "description", content: "Get Kernel Axiom on your computer and phone. Windows installer, plus install-to-home-screen for iPhone and Android." },
      { property: "og:title", content: "Download Kernel Axiom" },
      { property: "og:description", content: "Windows desktop app and home-screen app for iPhone and Android." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DownloadPage,
});

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function DownloadPage() {
  const [installEvt, setInstallEvt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const cards = [
    {
      icon: Monitor,
      label: "Windows",
      title: "Desktop app",
      body: "Works on files and runs commands in a folder you choose. Tray icon, Ctrl+Space to summon.",
      action: (
        <a href={WINDOWS_URL} download="KernelAxiom-Windows-x64.zip" className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm text-primary-foreground hover:bg-primary/85">
          Download for Windows ({WINDOWS_SIZE_MB} MB)
        </a>
      ),
      note: "Windows 10 and 11, 64-bit. Unzip, then open Kernel Axiom.exe. SmartScreen may warn until the app is signed: choose More info, then Run anyway.",
    },
    {
      icon: Smartphone,
      label: "iPhone & Android",
      title: "Phone app",
      body: "Opens links, calls, texts, maps and the share sheet for you, always after you approve.",
      action: installEvt ? (
        <KButton
          variant="primary"
          onClick={async () => {
            await installEvt.prompt();
            setInstallEvt(null);
          }}
        >
          Install on this phone
        </KButton>
      ) : (
        <p className="text-sm">{installed ? "Installed. Open it from your home screen." : "Install from your browser:"}</p>
      ),
      note: "iPhone: open this site in Safari, tap Share, then Add to Home Screen. Android: open in Chrome, tap the menu, then Install app.",
    },
    {
      icon: Globe,
      label: "Any browser",
      title: "Web app",
      body: "Nothing to install. Your chats stay in this browser on this device.",
      action: (
        <Link to="/" className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm hover:bg-foreground/5">
          Open in browser
        </Link>
      ),
      note: "Mac and Linux: use the web app for now.",
    },
  ];

  return (
    <div className="min-h-dvh px-4 py-6">
      <Backdrop />
      <div className="mx-auto max-w-5xl">
        <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm hover:bg-foreground/5">
          <ArrowLeft className="size-4" aria-hidden /> Back to Kernel Axiom
        </Link>
        <header className="mt-10 flex flex-col items-center text-center">
          <Orb size={104} state="celebrating" />
          <h1 className="rise-in mt-8 text-5xl sm:text-6xl">Get Kernel Axiom</h1>
          <p className="mt-4 max-w-md text-muted-foreground">One calm agent on your computer and your phone. It asks before it acts.</p>
        </header>
        <ul className="mt-14 grid gap-4 md:grid-cols-3">
          {cards.map((c, i) => (
            <motion.li
              key={c.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.08 * i }}
              className="glass flex flex-col rounded-3xl p-6"
            >
              <c.icon className="size-5" aria-hidden />
              <p className="label-mono mt-6 text-muted-foreground">{c.label}</p>
              <h2 className="mt-2 text-2xl">{c.title}</h2>
              <p className="mt-3 flex-1 text-sm text-muted-foreground">{c.body}</p>
              <div className="mt-6">{c.action}</div>
              <p className="mt-4 text-xs text-muted-foreground">{c.note}</p>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}
