import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private tokenKey = 'noir_chat_token';

  constructor(private http: HttpClient) {}

  register(phone: string, nickname: string, password: string): Observable<{ token: string }> {
    return this.http.post<{ token: string }>('http://localhost:3000/api/register', { phone, nickname, password });
  }

  login(phone: string, password: string): Observable<{ token: string }> {
    return this.http.post<{ token: string }>('http://localhost:3000/api/login', { phone, password });
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  saveToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }
}
