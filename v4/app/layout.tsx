import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { ChatProvider } from "@/lib/chat-context";
import ChatWidget from "@/components/ChatWidget";

export const metadata: Metadata = {
  title: {
    default: "CarMatch Avalia — a troca fecha quando o número é justo",
    template: "%s · CarMatch Avalia",
  },
  description:
    "Marketplace brasileiro de troca de carros com avaliação transparente: valor justo a partir da FIPE, faixa de confiança, detalhamento em reais e acerto de dinheiro recomendado.",
  applicationName: "CarMatch Avalia",
  openGraph: {
    title: "CarMatch Avalia — a troca fecha quando o número é justo",
    description:
      "A FIPE é referência, não preço. Veja o valor justo do seu carro e de quem você quer trocar, com cada ajuste explicado.",
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
                  CarMatch Avalia
                </span>{" "}
                — a troca fecha quando o número é justo.
              </p>
              <p>
                Valores calculados a partir da Tabela FIPE com modelo
                heurístico. Não substitui vistoria. Negocie em local seguro.
              </p>
            </div>
          </footer>

          <ChatWidget />
        </ChatProvider>
      </body>
    </html>
  );
}
