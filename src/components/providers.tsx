"use client";

import { SessionProvider } from "next-auth/react";
import { ChatProvider } from "./chat-provider";
import Chat from "./chat";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ChatProvider>
        {children}
        <Chat />
      </ChatProvider>
    </SessionProvider>
  );
}
