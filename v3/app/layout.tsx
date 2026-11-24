import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { ChatProvider } from "@/lib/chat-context";
import ChatWidget from "@/components/ChatWidget";

export const metadata: Metadata = {
  title: {
    default: "CarMatch Corrente — Troque seu carro",
    template: "%s · CarMatch Corrente",
  },
  description:
    "Plataforma brasileira de troca de carros. Publique seu veículo, diga o que aceita e encontre matches diretos ou correntes de troca de 3 a 5 pessoas, com ou sem diferença em dinheiro.",
  applicationName: "CarMatch Corrente",
  openGraph: {
    title: "CarMatch Corrente — Troque seu carro",
    description:
      "Ninguém precisa querer o seu carro. A corrente fecha: trocas de 3 a 5 pessoas em que cada um quer o carro do seguinte.",
    type: "website",
    locale: "pt_BR",
  },
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
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
                <span className="font-semibold text-ink-600">CarMatch Corrente</span>{" "}
                — troca de carros entre pessoas, em corrente.
              </p>
              <p>
                Valores baseados na Tabela FIPE. Negocie sempre em local seguro.
              </p>
            </div>
          </footer>

          <ChatWidget />
        </ChatProvider>
      </body>
    </html>
  );
}
