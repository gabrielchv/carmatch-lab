import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: {
    default: "CarMatch Confiança — só fecha com quem tem dossiê",
    template: "%s · CarMatch Confiança",
  },
  description:
    "Plataforma brasileira de troca de carros. Publique seu veículo, diga o que aceita e encontre matches automáticos com ou sem diferença em dinheiro.",
  applicationName: "CarMatch Confiança",
  openGraph: {
    title: "CarMatch Confiança — só fecha com quem tem dossiê",
    description:
      "Encontre alguém que quer exatamente o seu carro. Troca direta ou com diferença em dinheiro.",
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
          <Navbar />
          <main className="flex-1">{children}</main>

          <footer className="mt-8 border-t border-ink-200 bg-white">
            <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-4 py-6 text-[11.5px] text-ink-400 sm:flex-row sm:items-center">
              <p>
                <span className="font-semibold text-ink-600">CarMatch Confiança</span>{" "}
                — só fecha com quem tem dossiê.
              </p>
              <p>
                Valores baseados na Tabela FIPE. Verifique o dossiê antes de fechar.
              </p>
            </div>
          </footer>

      </body>
    </html>
  );
}
