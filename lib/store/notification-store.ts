// lib/store/notification-store.ts
import { create } from "zustand";

type NotificationStore = {
  unread: Set<string>;
  markUnread: (sessionId: string) => void;
  markRead: (sessionId: string) => void;
};

export const useNotificationStore = create<NotificationStore>()((set) => ({
  unread: new Set(),

  markUnread: (sessionId) =>
    set((state) => ({ unread: new Set([...state.unread, sessionId]) })),

  markRead: (sessionId) =>
    set((state) => {
      const unread = new Set(state.unread);
      unread.delete(sessionId);
      return { unread };
    }),
}));
