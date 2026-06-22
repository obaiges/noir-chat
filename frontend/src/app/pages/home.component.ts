import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { SocketService } from '../socket.service';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-home',
  imports: [FormsModule],
  template: `
    <div class="home-container">
      <header class="header">
        <h1 class="logo">NOIR</h1>
        <div class="actions">
          <button class="btn-invites" (click)="showInvites = true">
            INVITES
            @if (socketService.inviteCount() > 0) {
              <span class="badge">{{ socketService.inviteCount() }}</span>
            }
          </button>
          <button class="logout" (click)="logout()">LOGOUT</button>
        </div>
      </header>

      <main class="chat-list">
        @for (chat of socketService.chats(); track chat.id) {
          <div class="chat-item" (click)="openChat(chat.id)">
            <div class="chat-avatar">
              {{ chat.is_dm ? 'DM' : 'G' }}
              @if (socketService.unreadCounts()[chat.id]) {
                <span class="unread-badge">{{ socketService.unreadCounts()[chat.id] }}</span>
              }
            </div>
            <div class="chat-info">
              <span class="chat-name">{{ chat.display_name }}</span>
              @if (socketService.writingInChat()[chat.id]) {
                @if (chat.is_dm) {
                  <span class="writing-hint">Writing...</span>
                } @else {
                  <span class="writing-hint">{{ socketService.writingInChat()[chat.id] }} is writing...</span>
                }
              } @else {
                <span class="chat-type">{{ chat.is_dm ? 'Direct message' : 'Group · ' + chat.member_count + ' members' }}</span>
              }
            </div>
          </div>
        } @empty {
          <div class="empty">
            <p>No chats yet</p>
            <p class="hint">Tap + to start a new conversation</p>
          </div>
        }
      </main>

      <button class="fab" (click)="showNewChat = true">+</button>
    </div>

    @if (showNewChat) {
      <div class="modal-overlay" (click)="showNewChat = false">
        <div class="modal" (click)="$event.stopPropagation()">
          <h2>New Chat</h2>
          <p class="modal-sub">Search by phone number</p>
          <input
            type="tel"
            placeholder="Phone number"
            [(ngModel)]="searchPhone"
            (input)="searchUser()"
          />
          @if (searchResult) {
            @if (requestSent) {
              <div class="search-result sent">
                <div class="result-avatar">{{ searchResult.nickname[0] }}</div>
                <div class="result-info">
                  <span class="result-name">{{ searchResult.nickname }}</span>
                  <span class="result-phone">Request sent</span>
                </div>
              </div>
            } @else {
              <div class="search-result" (click)="sendRequest(searchResult)">
                <div class="result-avatar">{{ searchResult.nickname[0] }}</div>
                <div class="result-info">
                  <span class="result-name">{{ searchResult.nickname }}</span>
                  <span class="result-phone">{{ searchResult.phone }} — Click to add</span>
                </div>
              </div>
            }
          } @else if (searched && !searchResult) {
            <p class="not-found">User not found</p>
          }
          <button class="btn-cancel" (click)="showNewChat = false">Cancel</button>
        </div>
      </div>
    }

    @if (showInvites) {
      <div class="modal-overlay" (click)="showInvites = false">
        <div class="modal" (click)="$event.stopPropagation()">
          <h2>Invitations</h2>

          <h3 class="section-title">Friend Requests</h3>
          @for (req of socketService.friendRequests(); track req.id) {
            <div class="invite-item">
              <div class="invite-info">
                <span class="invite-from">{{ req.from_nickname }}</span>
                <span class="invite-chat">Wants to chat</span>
              </div>
              <div class="invite-actions">
                <button class="btn-accept" (click)="acceptFriendRequest(req.id)">Accept</button>
                <button class="btn-deny" (click)="denyFriendRequest(req.id)">Deny</button>
              </div>
            </div>
          } @empty {
            <p class="not-found">No pending friend requests</p>
          }

          <h3 class="section-title">Group Invites</h3>
          @for (invite of socketService.pendingInvites(); track invite.id) {
            <div class="invite-item">
              <div class="invite-info">
                <span class="invite-from">{{ invite.from_nickname }}</span>
                <span class="invite-chat">{{ invite.chat_name || 'a group' }}</span>
              </div>
              <div class="invite-actions">
                <button class="btn-accept" (click)="acceptInvite(invite.id)">Accept</button>
                <button class="btn-deny" (click)="denyInvite(invite.id)">Deny</button>
              </div>
            </div>
          } @empty {
            <p class="not-found">No pending group invitations</p>
          }

          <button class="btn-cancel" (click)="showInvites = false">Close</button>
        </div>
      </div>
    }
  `,
  styles: [`
    .home-container {
      height: 100vh;
      display: flex;
      flex-direction: column;
      max-width: 720px;
      margin: 0 auto;
      border-left: 1px solid var(--border);
      border-right: 1px solid var(--border);
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--border);
      background: var(--bg-secondary);
    }

    .logo {
      font-size: 1rem;
      letter-spacing: 4px;
      color: var(--accent);
      font-weight: 300;
    }

    .actions {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .btn-invites {
      position: relative;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      padding: 0.4rem 0.8rem;
      border-radius: 6px;
      font-size: 0.7rem;
      letter-spacing: 2px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-invites:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .badge {
      position: absolute;
      top: -5px;
      right: -5px;
      background: var(--accent);
      color: #0d0d0d;
      font-size: 0.65rem;
      font-weight: 700;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .logout {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      padding: 0.4rem 0.8rem;
      border-radius: 6px;
      font-size: 0.7rem;
      letter-spacing: 2px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .logout:hover {
      border-color: var(--error);
      color: var(--error);
    }

    .chat-list {
      flex: 1;
      overflow-y: auto;
    }

    .chat-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      transition: background 0.2s;
    }

    .chat-item:hover {
      background: var(--bg-tertiary);
    }

    .chat-avatar {
      position: relative;
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--accent);
      flex-shrink: 0;
    }

    .unread-badge {
      position: absolute;
      top: -5px;
      right: -5px;
      background: var(--accent);
      color: #0d0d0d;
      font-size: 0.6rem;
      font-weight: 700;
      min-width: 18px;
      height: 18px;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
    }

    .chat-info {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .chat-name {
      font-size: 0.95rem;
      color: var(--text-primary);
    }

    .chat-type {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .writing-hint {
      font-size: 0.75rem;
      color: var(--accent);
      font-style: italic;
    }

    .empty {
      text-align: center;
      margin-top: 4rem;
      color: var(--text-secondary);
    }

    .hint {
      font-size: 0.85rem;
      margin-top: 0.5rem;
    }

    .fab {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: var(--accent);
      color: #0d0d0d;
      border: none;
      font-size: 1.75rem;
      font-weight: 300;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding-bottom: 2px;
      transition: background 0.2s;
      z-index: 10;
      box-shadow: 0 4px 20px rgba(212, 165, 116, 0.3);
    }

    .fab:hover {
      background: var(--accent-hover);
    }

    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 1rem;
    }

    .modal {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2rem;
      width: 100%;
      max-width: 400px;
    }

    .modal h2 {
      font-size: 1.1rem;
      font-weight: 400;
      letter-spacing: 2px;
      color: var(--accent);
      margin-bottom: 0.25rem;
    }

    .modal-sub {
      font-size: 0.8rem;
      color: var(--text-secondary);
      margin-bottom: 1rem;
    }

    .modal input {
      width: 100%;
      padding: 0.75rem 1rem;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 0.9rem;
      margin-bottom: 0.75rem;
    }

    .modal input:focus {
      border-color: var(--accent);
    }

    .search-result {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      background: var(--bg-tertiary);
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s;
      margin-bottom: 0.75rem;
    }

    .search-result:hover {
      background: var(--border);
    }

    .search-result.sent {
      cursor: default;
      opacity: 0.7;
    }

    .search-result.sent:hover {
      background: var(--bg-tertiary);
    }

    .section-title {
      font-size: 0.75rem;
      letter-spacing: 2px;
      color: var(--text-secondary);
      margin: 1rem 0 0.5rem;
      text-transform: uppercase;
    }

    .result-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--accent);
      color: #0d0d0d;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.85rem;
    }

    .result-info {
      display: flex;
      flex-direction: column;
    }

    .result-name {
      font-size: 0.9rem;
      color: var(--text-primary);
    }

    .result-phone {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .not-found {
      text-align: center;
      color: var(--text-secondary);
      font-size: 0.85rem;
      margin: 0.75rem 0;
    }

    .btn-cancel {
      width: 100%;
      padding: 0.6rem;
      margin-top: 0.5rem;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-secondary);
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-cancel:hover {
      border-color: var(--text-secondary);
    }

    .invite-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--border);
    }

    .invite-info {
      display: flex;
      flex-direction: column;
    }

    .invite-from {
      font-size: 0.9rem;
      color: var(--text-primary);
    }

    .invite-chat {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .invite-actions {
      display: flex;
      gap: 0.5rem;
    }

    .btn-accept {
      padding: 0.4rem 0.8rem;
      background: var(--accent);
      color: #0d0d0d;
      border: none;
      border-radius: 6px;
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 1px;
      cursor: pointer;
    }

    .btn-deny {
      padding: 0.4rem 0.8rem;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      border-radius: 6px;
      font-size: 0.7rem;
      cursor: pointer;
    }
  `]
})
export class HomeComponent {
  protected socketService = inject(SocketService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private http = inject(HttpClient);

  showNewChat = false;
  showInvites = false;
  searchPhone = '';
  searchResult: any = null;
  searched = false;
  requestSent = false;

  constructor() {
    const token = this.auth.getToken();
    if (token) {
      this.socketService.init(token);
    }
  }

  openChat(chatId: number) {
    this.router.navigate(['/chat', chatId]);
  }

  sendRequest(user: any) {
    this.socketService.sendFriendRequest(user.phone);
    this.requestSent = true;
  }

  searchUser() {
    const phone = this.searchPhone.trim();
    if (!phone) {
      this.searchResult = null;
      this.searched = false;
      this.requestSent = false;
      return;
    }
    this.searched = true;
    this.requestSent = false;
    this.http.post('http://localhost:3000/api/search-user', { phone })
      .subscribe({
        next: (res: any) => {
          this.searchResult = res.user;
        },
        error: () => {
          this.searchResult = null;
        }
      });
  }

  acceptInvite(inviteId: number) {
    this.socketService.respondInvite(inviteId, true);
  }

  denyInvite(inviteId: number) {
    this.socketService.respondInvite(inviteId, false);
  }

  acceptFriendRequest(requestId: number) {
    this.socketService.respondFriendRequest(requestId, true);
  }

  denyFriendRequest(requestId: number) {
    this.socketService.respondFriendRequest(requestId, false);
  }

  logout() {
    this.socketService.disconnect();
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
