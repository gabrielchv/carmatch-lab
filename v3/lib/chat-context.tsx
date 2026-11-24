"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface ChatContextType {
  isOpen: boolean;
  currentView: "list" | "chat";
  selectedConversationId: string | null;
  openWidget: () => void;
  closeWidget: () => void;
  toggleWidget: () => void;
  openConversation: (conversationId: string) => void;
  backToList: () => void;
  startConversation: (postId: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentView, setCurrentView] = useState<"list" | "chat">("list");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  const openWidget = useCallback(() => {
    setCurrentView("list");
    setSelectedConversationId(null);
    setIsOpen(true);
  }, []);

  const closeWidget = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleWidget = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const openConversation = useCallback((conversationId: string) => {
    setSelectedConversationId(conversationId);
    setCurrentView("chat");
    setIsOpen(true);
  }, []);

  const backToList = useCallback(() => {
    setCurrentView("list");
    setSelectedConversationId(null);
  }, []);

  const startConversation = useCallback(
    async (postId: string) => {
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId }),
        });
        if (res.ok) {
          const data = await res.json();
          openConversation(data.conversation.id);
        }
      } catch {
        // silent — widget stays closed
      }
    },
    [openConversation]
  );

  return (
    <ChatContext.Provider
      value={{
        isOpen,
        currentView,
        selectedConversationId,
        openWidget,
        closeWidget,
        toggleWidget,
        openConversation,
        backToList,
        startConversation,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatContextType {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return ctx;
}
