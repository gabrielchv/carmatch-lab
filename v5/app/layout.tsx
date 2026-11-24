import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { ChatProvider } from "@/lib/chat-context";
import ChatWidget from "@/components/ChatWidget";

export const metadata: Metadata = {
  title: {
    default: "CarMatch Troca Fechada — o match é o começo",
    template: "%s · CarMatch Troca Fechada",
  },
  description:
    "Plataforma brasileira de troca de carros. O match é o começo: a Troca Fechada conduz vistoria, documentos, contrato e transferência no Detran até a troca estar concluída.",
  applicationName: "CarMatch Troca Fechada",
  openGraph: {
    title: "CarMatch Troca Fechada — o match é o começo",
    description:
      "Encontre alguém que quer exatamente o seu carro e feche a troca com vistoria, documentos, contrato e Detran organizados dos dois lados.",
    type: "website",
    locale: "pt_BR",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
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
                  CarMatch Troca Fechada
                </span>{" "}
                — o match é o começo. A Troca Fechada cuida do resto.
              </p>
              <p>
                Valores baseados na Tabela FIPE. Vistoria e transferência sempre
                no Detran do seu estado.
              </p>
            </div>
          </footer>

          <ChatWidget />
        </ChatProvider>
      </body>
    </html>
  );
}
