"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PostForm from "@/components/PostForm";
import type { CarPost } from "@/lib/types";

export default function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [post, setPost] = useState<CarPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [postRes, authRes] = await Promise.all([
          fetch(`/api/posts/${id}`),
          fetch("/api/auth/me"),
        ]);

        if (!authRes.ok) {
          router.push("/auth");
          return;
        }

        if (!postRes.ok) {
          setError("Anúncio não encontrado");
          return;
        }

        const postData = await postRes.json();

        // Verifica ownership
        const authData = await authRes.json();
        if (authData.user?.id !== postData.post.userId) {
          setError("Você não tem permissão para editar este anúncio");
          return;
        }

        setPost(postData.post);
      } catch {
        setError("Erro ao carregar anúncio");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router]);

  if (loading) {
    return <div className="text-center py-16 text-gray-400">Carregando...</div>;
  }

  if (error || !post) {
    return (
      <div className="text-center py-16 text-gray-500">
        {error || "Não encontrado"}
        <div className="mt-4">
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:underline text-sm"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Editar Anúncio</h1>
      <PostForm initialData={post} postId={id} />
    </div>
  );
}
