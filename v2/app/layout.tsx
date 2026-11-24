import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { ChatProvider } from "@/lib/chat-context";
import ChatWidget from "@/components/ChatWidget";

export const metadata: Metadata = {
  title: {
    default: "CarMatch Confiança — Troca com verificação",
    template: "%s · CarMatch Confiança",
  },
  description:
    "Troca de carros com verificação. Veja o nível de confiança do vendedor e o dossiê do veículo antes de fechar negócio.",
  applicationName: "CarMatch Confiança",
  openGraph: {
    title: "CarMatch Confiança — Troca com verificação",
    description:
      "Só fecha com quem tem dossiê: conta verificada, documento no nome do vendedor, sem multas nem gravame e vistoria.",
    type: "website",
    locale: "pt_BR",
  },
};

export const viewport: Viewport = {
  themeColor: "#047857",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <ChatProvider>
          <Navbar />
          <main className="flex-1">{children}</main>

          <footer className="mt-8 border-t border-ink-200 bg-white">
            <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-4 py-6 text-[11.5px] text-ink-400 sm:flex-row sm:items-center">
              <p>
                <span className="font-semibold text-ink-600">
                  CarMatch Confiança
                </span>{" "}
                — troca de carros com verificação.
              </p>
              <p>
                Valores baseados na Tabela FIPE. Negocie sempre em local
                seguro.
              </p>
            </div>
          </footer>

          <ChatWidget />
        </ChatProvider>
      </body>
    </html>
  );
}
