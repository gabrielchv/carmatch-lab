import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: {
    default: "CarMatch Roda — Troque seu carro em roda",
    template: "%s · CarMatch Roda",
  },
  description:
    "Plataforma brasileira de troca de carros em roda: três a cinco pessoas que querem o carro umas das outras trocam de uma vez, com ou sem diferença em dinheiro.",
  applicationName: "CarMatch Roda",
  openGraph: {
    title: "CarMatch Roda — Troque seu carro em roda",
    description:
      "Encontre uma roda de troca: A quer o carro de B, B quer o de C, C quer o de A.",
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
                <span className="font-semibold text-ink-600">CarMatch Roda</span> —
                troca de carros em círculo.
              </p>
              <p>
                Valores baseados na Tabela FIPE. Negocie sempre em local seguro.
              </p>
            </div>
          </footer>

      </body>
    </html>
  );
}
