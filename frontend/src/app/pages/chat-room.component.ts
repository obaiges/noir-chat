import { Component, inject, OnInit, OnDestroy, ViewChild, ElementRef, effect, computed } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { SocketService, ChatMessage, Chat } from '../socket.service';

interface DateGroup {
  label: string;
  messages: ChatMessage[];
}

@Component({
  selector: 'app-chat-room',
  imports: [FormsModule],
  template: `
    <div class="chat-container">
      <header class="header">
        <button class="back" (click)="goBack()">←</button>
        <h1 class="title">{{ displayName }}</h1>
      </header>

      <main class="messages" #messageContainer>
        @for (group of dateGroups(); track group.label) {
          <div class="date-separator">{{ group.label }}</div>
          @for (msg of group.messages; track msg.id) {
            <div class="message" [class.own]="msg.sender_id === userId">
              <div class="msg-header">
                <span class="sender">{{ msg.sender_nickname }}</span>
                <span class="time">{{ formatTime(msg.created_at) }}</span>
              </div>
              <span class="text">{{ msg.message }}</span>
            </div>
          }
        } @empty {
          <p class="empty">No messages yet</p>
        }
      </main>

      <footer class="input-bar" [class.anon]="isAnonymous">
        @if (isGroup) {
          <button class="btn-anon" [class.active]="isAnonymous" (click)="isAnonymous = !isAnonymous" title="Toggle anonymous">
            @if (isAnonymous) { ANON ON } @else { ANON }
          </button>
        }
        <input
          #messageInput
          type="text"
          [placeholder]="isAnonymous ? 'Write anonymously...' : 'Type a message...'"
          (keydown)="onTyping()"
          (keyup.enter)="send(messageInput); messageInput.value = ''"
        />
        <button (click)="send(messageInput); messageInput.value = ''">SEND</button>
        @if (isAnonymous) {
          <span class="anon-tag">ANONYMOUS</span>
        }
      </footer>

      @if (writingActive()) {
        <div class="writing">
          @if (isGroup) {
            {{ socketService.writingInChat()[chatId] }} is writing...
          } @else {
            Writing...
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .chat-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      max-width: 720px;
      margin: 0 auto;
      border-left: 1px solid var(--border);
      border-right: 1px solid var(--border);
    }

    .header {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--border);
      background: var(--bg-secondary);
    }

    .back {
      background: transparent;
      border: none;
      color: var(--accent);
      font-size: 1.25rem;
      cursor: pointer;
      padding: 0;
    }

    .title {
      font-size: 0.95rem;
      font-weight: 400;
      color: var(--text-primary);
    }

    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .date-separator {
      text-align: center;
      font-size: 0.7rem;
      color: var(--text-secondary);
      letter-spacing: 1px;
      padding: 0.75rem 0 0.25rem;
      text-transform: uppercase;
    }

    .message {
      max-width: 75%;
      padding: 0.6rem 0.9rem;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: 8px;
      align-self: flex-start;
    }

    .message.own {
      background: rgba(212, 165, 116, 0.1);
      border-color: rgba(212, 165, 116, 0.3);
      align-self: flex-end;
    }

    .msg-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.2rem;
    }

    .sender {
      font-size: 0.7rem;
      color: var(--accent);
      font-weight: 600;
    }

    .time {
      font-size: 0.6rem;
      color: var(--text-secondary);
      margin-left: auto;
    }

    .text {
      font-size: 0.9rem;
      color: var(--text-primary);
      word-break: break-word;
    }

    .empty {
      text-align: center;
      color: var(--text-secondary);
      margin-top: 2rem;
    }

    .input-bar {
      display: flex;
      gap: 0.5rem;
      padding: 1rem 1.5rem;
      border-top: 1px solid var(--border);
      background: var(--bg-secondary);
      position: relative;
    }

    .btn-anon {
      padding: 0.75rem 0.8rem;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-secondary);
      font-size: 0.7rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      letter-spacing: 0;
    }

    .btn-anon.active {
      background: rgba(212, 165, 116, 0.15);
      border-color: var(--accent);
      color: var(--accent);
    }

    .input-bar.anon {
      border-top-color: var(--accent);
    }

    .anon-tag {
      position: absolute;
      bottom: 100%;
      right: 1.5rem;
      background: var(--accent);
      color: #0d0d0d;
      font-size: 0.6rem;
      font-weight: 700;
      letter-spacing: 1px;
      padding: 0.2rem 0.6rem;
      border-radius: 4px 4px 0 0;
    }

    .input-bar input {
      flex: 1;
      padding: 0.75rem 1rem;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 0.9rem;
    }

    .input-bar input:focus {
      border-color: var(--accent);
      outline: none;
    }

    .input-bar input::placeholder {
      color: var(--text-secondary);
    }

    .input-bar button {
      padding: 0.75rem 1.25rem;
      background: var(--accent);
      color: #0d0d0d;
      border: none;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 2px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .input-bar button:hover {
      background: var(--accent-hover);
    }

    .writing {
      position: fixed;
      bottom: 6rem;
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      padding: 0.4rem 1rem;
      border-radius: 20px;
      font-size: 0.8rem;
      color: var(--text-secondary);
    }
  `]
})
export class ChatRoomComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  protected socketService = inject(SocketService);
  private auth = inject(AuthService);

  @ViewChild('messageContainer') private messageContainer!: ElementRef;

  chatId = 0;
  displayName = '';
  userId = 0;
  isGroup = false;
  isAnonymous = false;

  writingActive = computed(() => !!this.socketService.writingInChat()[this.chatId]);

  private chatEffect = effect(() => {
    const chats = this.socketService.chats();
    if (!this.chatId || !chats.length) return;
    const chat = chats.find(c => c.id === this.chatId);
    if (chat) {
      this.displayName = chat.display_name || 'Chat';
      this.isGroup = !chat.is_dm;
    }
  });

  dateGroups = computed(() => {
    const groups: DateGroup[] = [];
    const msgs = this.socketService.messages();
    let currentLabel = '';
    let currentMessages: ChatMessage[] = [];

    for (const msg of msgs) {
      const label = this.formatDateHeader(msg.created_at);
      if (label !== currentLabel && currentMessages.length) {
        groups.push({ label: currentLabel, messages: currentMessages });
        currentMessages = [];
      }
      currentLabel = label;
      currentMessages.push(msg);
    }
    if (currentMessages.length) {
      groups.push({ label: currentLabel, messages: currentMessages });
    }
    return groups;
  });

  private scrollEffect = effect(() => {
    const groups = this.dateGroups();
    if (groups.length) {
      setTimeout(() => this.scrollToBottom(), 0);
    }
  });

  formatTime(dateStr: string): string {
    const d = new Date(dateStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  formatDateHeader(dateStr: string): string {
    const d = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((today.getTime() - msgDay.getTime()) / 86400000);

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (diffDays < 7) return dayNames[d.getDay()];

    return `${dayNames[d.getDay()]} ${d.getDate()} ${monthNames[d.getMonth()]}`;
  }

  ngOnInit() {
    const token = this.auth.getToken();
    if (!token) {
      this.router.navigate(['/login']);
      return;
    }

    this.socketService.init(token);

    const id = this.route.snapshot.paramMap.get('id');
    this.socketService.setCurrentChat(Number(id));
    this.chatId = Number(id);

    const chats = this.socketService.chats();
    const chat = chats.find(c => c.id === this.chatId);
    this.displayName = chat?.display_name || 'Chat';
    this.isGroup = chat ? !chat.is_dm : false;

    this.socketService.joinChat(this.chatId);
    this.socketService.getMessages(this.chatId);

    const payload = this.parseJwt(token);
    this.userId = payload?.userId || 0;
  }

  ngOnDestroy() {
    this.socketService.setCurrentChat(null);
    this.socketService.leaveChat(this.chatId);
  }

  onTyping() {
    if (!this.isAnonymous) {
      this.socketService.writing(this.chatId);
    }
  }

  send(input: HTMLInputElement) {
    const content = input.value.trim();
    if (!content) return;
    this.socketService.sendMessage(this.chatId, content, this.isAnonymous);
  }

  goBack() {
    this.router.navigate(['/']);
  }

  private scrollToBottom() {
    try {
      const el = this.messageContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch { }
  }

  private parseJwt(token: string): any {
    try {
      return JSON.parse(atob(token.split('.')[1]));
    } catch {
      return null;
    }
  }
}
