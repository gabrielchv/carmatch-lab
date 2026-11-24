import type { Metadata } from "next";
import RodaView from "@/components/RodaView";

export const metadata: Metadata = {
  title: "Roda",
  description:
    "Rodas de troca de 3 a 5 carros: cada pessoa quer o carro da próxima e todas trocam de uma vez, fechando no WhatsApp.",
};

export default function RodaPage() {
  return <RodaView />;
}
