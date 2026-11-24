import type { Metadata } from "next";
import CompararClient from "@/components/CompararClient";

export const metadata: Metadata = {
  title: "Comparar dois carros",
  description:
    "Compare o valor justo de dois anúncios lado a lado e veja o acerto de dinheiro recomendado, com faixa de negociação e justificativa.",
};

export default function CompararPage() {
  return <CompararClient />;
}
