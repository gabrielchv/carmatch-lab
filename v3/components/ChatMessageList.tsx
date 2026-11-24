"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { Message } from "@/lib/types";

interface Props {
  messages: Message[];
  currentUserId: string;
}

export default function ChatMessageList({ messages, currentUserId }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  // Track if user is near the bottom
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    setShouldAutoScroll(nearBottom);
  }, []);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (shouldAutoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, shouldAutoScroll]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm p-4">
        Nenhuma mensagem ainda. Envie a primeira!
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-4 space-y-3"
    >
      {messages.map((msg) => {
        const isMine = msg.senderId === currentUserId;
        const time = new Date(msg.createdAt).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        });

        return (
          <div
            key={msg.id}
            className={`flex ${isMine ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                isMine
                  ? "bg-blue-600 text-white rounded-br-sm"
                  : "bg-gray-100 text-gray-900 rounded-bl-sm"
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{msg.text}</p>
              <p
                className={`text-[10px] mt-1 ${
                  isMine ? "text-blue-200" : "text-gray-400"
                }`}
              >
                {time}
              </p>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
