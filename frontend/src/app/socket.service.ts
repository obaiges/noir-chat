import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';

export interface Chat {
  id: number;
  name: string | null;
  display_name: string;
  is_dm: boolean;
  member_count: number;
  created_at: string;
  last_message_at: string;
  unread_count: number;
}

export interface ChatMessage {
  id: number;
  chat_id: number;
  sender_id: number;
  sender_nickname: string;
  message: string;
  created_at: string;
}

export interface Invite {
  id: number;
  chat_id: number;
  chat_name: string | null;
  from_nickname: string;
  status: string;
  created_at: string;
}

export interface FriendRequest {
  id: number;
  from_nickname: string;
  status: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;
  private lastWritingTime = 0;
  private stoppedWritingTimer: any;
  private writingTimers: Record<number, any> = {};

  writingInChat = signal<Record<number, string>>({});
  unreadCounts = signal<Record<number, number>>({});
  currentChatId: number | null = null;
  messages = signal<ChatMessage[]>([]);
  chats = signal<Chat[]>([]);
  pendingInvites = signal<Invite[]>([]);
  friendRequests = signal<FriendRequest[]>([]);
  inviteCount = signal(0);

  init(token: string) {
    if (this.socket?.connected) return;

    this.socket = io('http://localhost:3000', { auth: { token } });

    this.socket.on('connect', () => {
      this.getChats();
      this.getPendingInvites();
      this.getPendingFriendRequests();
    });

    this.socket.on('writing', ({ chatId, nickname }: { chatId: number; nickname: string }) => {
      this.writingInChat.update(w => ({ ...w, [chatId]: nickname }));
      clearTimeout(this.writingTimers[chatId]);
      this.writingTimers[chatId] = setTimeout(() => {
        this.writingInChat.update(w => {
          const next = { ...w };
          delete next[chatId];
          return next;
        });
        delete this.writingTimers[chatId];
      }, 4000);
    });

    this.socket.on('stoppedWriting', ({ chatId }: { chatId: number }) => {
      this.writingInChat.update(w => {
        const next = { ...w };
        delete next[chatId];
        return next;
      });
      clearTimeout(this.writingTimers[chatId]);
      delete this.writingTimers[chatId];
    });

    this.socket.on('chats', (chats: Chat[]) => {
      this.chats.set(chats);
      const counts: Record<number, number> = {};
      for (const c of chats) {
        if (c.unread_count) counts[c.id] = c.unread_count;
      }
      this.unreadCounts.set(counts);
    });

    this.socket.on('chatCreated', (chat: Chat) => {
      this.chats.update(list => {
        if (list.some(c => c.id === chat.id)) return list;
        return [chat, ...list];
      });
      if (chat.unread_count) {
        this.unreadCounts.update(u => ({ ...u, [chat.id]: chat.unread_count }));
      }
    });

    this.socket.on('messages', (messages: ChatMessage[]) => {
      this.messages.set(messages);
    });

    this.socket.on('newMessage', (message: ChatMessage) => {
      if (message.chat_id === this.currentChatId) {
        this.messages.update((msgs) => [...msgs, message]);
      } else {
        this.unreadCounts.update(u => ({ ...u, [message.chat_id]: (u[message.chat_id] || 0) + 1 }));
      }
      this.chats.update(list => {
        const idx = list.findIndex(c => c.id === message.chat_id);
        if (idx <= 0) return list;
        const chat = { ...list[idx], last_message_at: message.created_at };
        return [chat, ...list.slice(0, idx), ...list.slice(idx + 1)];
      });
    });

    this.socket.on('pendingInvites', (invites: Invite[]) => {
      this.pendingInvites.set(invites);
      this.inviteCount.set(invites.length);
    });

    this.socket.on('newInvite', () => {
      this.getPendingInvites();
    });

    this.socket.on('inviteAccepted', (chat: Chat) => {
      this.getPendingInvites();
      this.chats.update(list => {
        if (list.some(c => c.id === chat.id)) return list;
        return [chat, ...list];
      });
    });

    this.socket.on('inviteDenied', () => {
      this.getPendingInvites();
    });

    this.socket.on('participantJoined', ({ chatId, memberCount }: { chatId: number, memberCount: number }) => {
      this.chats.update(list => list.map(c =>
        c.id === chatId ? { ...c, member_count: memberCount } : c
      ));
    });

    this.socket.on('pendingFriendRequests', (requests: FriendRequest[]) => {
      this.friendRequests.set(requests);
      this.inviteCount.set(this.pendingInvites().length + requests.length);
    });

    this.socket.on('newFriendRequest', () => {
      this.getPendingFriendRequests();
    });

    this.socket.on('friendRequestAccepted', (data: { chatId: number; display_name: string }) => {
      this.getPendingFriendRequests();
      this.getChats();
    });

    this.socket.on('friendRequestDenied', () => {
      this.getPendingFriendRequests();
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.messages.set([]);
    this.chats.set([]);
    this.pendingInvites.set([]);
    this.friendRequests.set([]);
    this.inviteCount.set(0);
    this.writingInChat.set({});
    this.unreadCounts.set({});
    this.currentChatId = null;
    Object.values(this.writingTimers).forEach(clearTimeout);
    this.writingTimers = {};
  }

  getChats() {
    this.socket?.emit('getChats');
  }

  markRead(chatId: number) {
    this.socket?.emit('markRead', { chatId });
  }

  setCurrentChat(chatId: number | null) {
    this.currentChatId = chatId;
    if (chatId) {
      this.unreadCounts.update(u => ({ ...u, [chatId]: 0 }));
      this.markRead(chatId);
    }
  }

  getMessages(chatId: number) {
    this.socket?.emit('getMessages', { chatId });
    this.unreadCounts.update(u => ({ ...u, [chatId]: 0 }));
  }

  createChat(participantPhone: string) {
    this.socket?.emit('createChat', { participantPhone });
  }

  createGroup(name: string, participantPhones: string[]) {
    this.socket?.emit('createGroup', { name, participantPhones });
  }

  joinChat(chatId: number) {
    this.socket?.emit('joinChat', { chatId });
  }

  leaveChat(chatId: number) {
    this.socket?.emit('leaveChat', { chatId });
  }

  sendMessage(chatId: number, content: string, anonymous = false) {
    if (!this.socket || !content?.trim()) return;
    this.stopWriting(chatId);
    this.socket.emit('sendMessage', { chatId, content, anonymous });
  }

  sendInvite(phone: string, chatId: number) {
    this.socket?.emit('sendInvite', { phone, chatId });
  }

  getPendingInvites() {
    this.socket?.emit('getPendingInvites');
  }

  respondInvite(inviteId: number, accept: boolean) {
    this.socket?.emit('respondInvite', { inviteId, accept });
  }

  sendFriendRequest(phone: string) {
    this.socket?.emit('sendFriendRequest', { phone });
  }

  getPendingFriendRequests() {
    this.socket?.emit('getPendingFriendRequests');
  }

  respondFriendRequest(requestId: number, accept: boolean) {
    this.socket?.emit('respondFriendRequest', { requestId, accept });
  }

  writing(chatId?: number) {
    if (!this.socket) return;

    const now = Date.now();
    if (now - this.lastWritingTime >= 1500) {
      this.lastWritingTime = now;
      this.socket.emit('writing', { chatId });
    }

    clearTimeout(this.stoppedWritingTimer);
    this.stoppedWritingTimer = setTimeout(() => {
      this.socket?.emit('stoppedWriting', { chatId });
    }, 1500);
  }

  stopWriting(chatId?: number) {
    if (!this.socket) return;
    clearTimeout(this.stoppedWritingTimer);
    this.socket.emit('stoppedWriting', { chatId });
  }
}
