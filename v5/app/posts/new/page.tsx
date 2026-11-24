"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PostForm from "@/components/PostForm";

export default function NewPostPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : { user: null }))
      .then((data) => {
        if (!data.user) router.replace("/auth?redirectTo=/posts/new");
      })
      .finally(() => setChecking(false));
  }, [router]);

  if (checking) {
    return <div className="text-center py-16 text-gray-400">Verificando...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto mt-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Anunciar meu carro</h1>
      <PostForm />
    </div>
  );
}
