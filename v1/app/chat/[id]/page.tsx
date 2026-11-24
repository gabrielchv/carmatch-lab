"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ChatRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Chat is now a widget — redirect to home on direct access
    router.replace("/");
  }, [router]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 text-center text-gray-400">
      Redirecionando...
    </div>
  );
}
