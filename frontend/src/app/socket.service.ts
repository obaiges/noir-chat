import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';

export interface Chat {
  id: number;
  name: string | null;
  display_name: string;
  is_dm: boolean;
  member_count: number;
  created_at: string;
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

  isWriting = signal(false);
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

    this.socket.on('writing', () => {
      this.isWriting.set(true);
    });

    this.socket.on('stoppedWriting', () => {
      this.isWriting.set(false);
    });

    this.socket.on('chats', (chats: Chat[]) => {
      this.chats.set(chats);
    });

    this.socket.on('chatCreated', (chat: Chat) => {
      this.getChats();
    });

    this.socket.on('messages', (messages: ChatMessage[]) => {
      this.messages.set(messages);
    });

    this.socket.on('newMessage', (message: ChatMessage) => {
      this.messages.update((msgs) => [...msgs, message]);
    });

    this.socket.on('pendingInvites', (invites: Invite[]) => {
      this.pendingInvites.set(invites);
      this.inviteCount.set(invites.length);
    });

    this.socket.on('newInvite', () => {
      this.getPendingInvites();
    });

    this.socket.on('inviteAccepted', () => {
      this.getPendingInvites();
      this.getChats();
    });

    this.socket.on('inviteDenied', () => {
      this.getPendingInvites();
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
  }

  getChats() {
    this.socket?.emit('getChats');
  }

  getMessages(chatId: number) {
    this.socket?.emit('getMessages', { chatId });
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

  sendMessage(chatId: number, content: string) {
    if (!this.socket || !content?.trim()) return;
    this.stopWriting(chatId);
    this.socket.emit('sendMessage', { chatId, content });
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
