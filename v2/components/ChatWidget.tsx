"use client";

import { useEffect, useState, useCallback } from "react";
import { useChat } from "@/lib/chat-context";
import type { Message } from "@/lib/types";
import ChatMessageList from "@/components/ChatMessageList";
import MessageInput from "@/components/MessageInput";

interface ConversationSummary {
  id: string;
  postId: string;
  postTitle: string;
  postImage: string | null;
  otherUserId: string;
  otherUserName: string;
  matchId: string | null;
  lastMessageAt: string;
  createdAt: string;
}

interface ConversationDetail {
  id: string;
  postId: string;
  postTitle: string;
  postImage: string | null;
  otherUserName: string;
  participantIds: string[];
}

export default function ChatWidget() {
  const {
    isOpen,
    currentView,
    selectedConversationId,
    closeWidget,
    toggleWidget,
    openConversation,
    backToList,
  } = useChat();

  const [user, setUser] = useState<{ id: string; name: string } | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [convDetail, setConvDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // Auth check on mount
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user) setUser(d.user);
      })
      .catch(() => {});
  }, []);

  // Fetch conversation list when opening
  useEffect(() => {
    if (!isOpen || currentView !== "list") return;
    setLoadingList(true);
    fetch("/api/conversations")
      .then((r) => (r.ok ? r.json() : { conversations: [] }))
      .then((d) => setConversations(d.conversations || []))
      .finally(() => setLoadingList(false));
  }, [isOpen, currentView]);

  // Fetch conversation detail when opening a chat
  useEffect(() => {
    if (!selectedConversationId) {
      setConvDetail(null);
      setMessages([]);
      return;
    }
    fetch(`/api/conversations/${selectedConversationId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.conversation) setConvDetail(d.conversation);
      })
      .catch(() => {});
  }, [selectedConversationId]);

  // Fetch + poll messages when a conversation is selected
  const fetchMessages = useCallback(async () => {
    if (!selectedConversationId) return;
    try {
      const res = await fetch(
        `/api/conversations/${selectedConversationId}/messages`
      );
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {
      // silent
    }
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) return;
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [selectedConversationId, fetchMessages]);

  // Send a message
  const handleSend = async (text: string) => {
    if (!selectedConversationId) return;
    const res = await fetch(
      `/api/conversations/${selectedConversationId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }
    );
    if (res.ok) {
      await fetchMessages();
    }
  };

  // Don't render anything if not logged in
  if (!user) return null;

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={toggleWidget}
          className="fixed bottom-4 right-4 z-50 w-12 h-12 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center text-xl"
          aria-label="Abrir chat"
        >
          💬
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 z-50 w-96 max-h-[560px] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          {/* --- Header --- */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
            <div className="flex items-center gap-2">
              {currentView === "chat" && (
                <button
                  onClick={backToList}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  &larr; Voltar
                </button>
              )}
              <span className="font-semibold text-sm">
                {currentView === "chat"
                  ? convDetail?.otherUserName ?? "Carregando..."
                  : "Conversas"}
              </span>
            </div>
            <button
              onClick={closeWidget}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>

          {/* --- List view --- */}
          {currentView === "list" && (
            <div className="flex-1 overflow-y-auto p-2">
              {loadingList ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  Carregando...
                </div>
              ) : conversations.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  Nenhuma conversa ainda.
                </div>
              ) : (
                <div className="space-y-1">
                  {conversations.map((conv) => {
                    const lastMessageDate = new Date(conv.lastMessageAt);
                    const now = new Date();
                    const diffMs = now.getTime() - lastMessageDate.getTime();
                    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                    const timeAgo =
                      diffHours < 1
                        ? "agora"
                        : diffHours < 24
                        ? `${diffHours}h`
                        : lastMessageDate.toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                          });

                    return (
                      <button
                        key={conv.id}
                        onClick={() => openConversation(conv.id)}
                        className="w-full text-left flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        {conv.postImage ? (
                          <img
                            src={`/uploads/${conv.postImage}`}
                            alt=""
                            className="w-10 h-10 object-cover rounded-lg shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-gray-100 rounded-lg shrink-0 flex items-center justify-center text-gray-400 text-xs">
                            📷
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-medium text-sm truncate">
                              {conv.otherUserName}
                            </span>
                            <span className="text-[10px] text-gray-400 shrink-0">
                              {timeAgo}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 truncate">
                            {conv.postTitle}
                          </p>
                          {conv.matchId && (
                            <span className="inline-block mt-0.5 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                              Match!
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* --- Chat view --- */}
          {currentView === "chat" && (
            <>
              <div className="flex-1 flex flex-col min-h-0">
                {user && (
                  <ChatMessageList
                    messages={messages}
                    currentUserId={user.id}
                  />
                )}
              </div>
              <MessageInput onSend={handleSend} />
            </>
          )}
        </div>
      )}
    </>
  );
}
