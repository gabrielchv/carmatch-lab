import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: {
    default: "CarMatch Preço — Troque seu carro com o preço justo",
    template: "%s · CarMatch Preço",
  },
  description:
    "Plataforma brasileira de troca de carros. Publique seu veículo, diga o que aceita e encontre matches automáticos — com um preço justo calculado a partir do km, do ano e da conservação.",
  applicationName: "CarMatch Preço",
  openGraph: {
    title: "CarMatch Preço — Troque seu carro com o preço justo",
    description:
      "Encontre alguém que quer exatamente o seu carro. Troca direta ou com diferença em dinheiro — com o preço justo na mensagem.",
    type: "website",
    locale: "pt_BR",
  },
};

export const viewport: Viewport = {
  themeColor: "#fbf8f3",
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
                <span className="font-semibold text-ink-600">
                  CarMatch Preço
                </span>{" "}
                — troca de carros entre pessoas.
              </p>
              <p>
                Preço justo é uma heurística; referências de Tabela FIPE.
                Negocie sempre em local seguro.
              </p>
            </div>
          </footer>

      </body>
    </html>
  );
}
