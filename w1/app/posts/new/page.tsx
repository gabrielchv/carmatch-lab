"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PostForm from "@/components/PostForm";
import { readDraft } from "@/lib/onboarding-draft";

/**
 * Publish a car.
 *
 * The form can arrive pre-filled: the onboarding sends the car the person has
 * (brand, FIPE code, year and value) and the car they want, so "finalize seu
 * cadastro para oficializar" does not ask the same four questions again.
 *
 * The draft lives in the query string, which also means the login redirect has
 * to carry it — otherwise the answers die exactly when someone creates an
 * account to keep them.
 */
function NewPostContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const draft = readDraft(searchParams);

  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const returnTo = query ? `/posts/new?${query}` : "/posts/new";

    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : { user: null }))
      .then((data) => {
        if (!data.user) {
          router.replace(`/auth?redirectTo=${encodeURIComponent(returnTo)}`);
        }
      })
      .catch(() =>
        router.replace(`/auth?redirectTo=${encodeURIComponent(returnTo)}`)
      )
      .finally(() => setChecking(false));
  }, [router, query]);

  if (checking) {
    return <div className="text-center py-16 text-gray-400">Verificando...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto mt-8 px-4">
      <h1 className="text-2xl font-bold mb-6">
        {draft ? "Falta só publicar" : "Anunciar meu carro"}
      </h1>
      {draft && (
        <p className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          Trouxemos o que você respondeu no onboarding. Confira os dados, coloque
          fotos e publique — é o que oficializa o match.
        </p>
      )}
      <PostForm draft={draft ?? undefined} />
    </div>
  );
}

export default function NewPostPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-4 py-24 text-center text-sm text-gray-400">
          Carregando...
        </div>
      }
    >
      <NewPostContent />
    </Suspense>
  );
}
