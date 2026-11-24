import type { Metadata } from "next";
import AvaliarClient from "@/components/AvaliarClient";

export const metadata: Metadata = {
  title: "Avaliar meu carro",
  description:
    "Calculadora de valor justo para troca de carros: ajusta a FIPE por quilometragem, idade, segmento e histórico, com faixa de confiança e detalhamento em reais.",
};

export default function AvaliarPage() {
  return <AvaliarClient />;
}
