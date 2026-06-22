import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="wrapper">
      <div class="card">
        <h1 class="title">NOIR</h1>
        <p class="subtitle">CHAT</p>
        <form (ngSubmit)="onSubmit()">
          <input
            type="tel"
            placeholder="Phone number"
            [(ngModel)]="phone"
            name="phone"
            required
          />
          <input
            type="password"
            placeholder="Password"
            [(ngModel)]="password"
            name="password"
            required
          />
          <button type="submit">LOGIN</button>
          @if (error) {
            <p class="error">{{ error }}</p>
          }
        </form>
        <a routerLink="/register" class="link">Don't have an account? Register</a>
      </div>
    </div>
  `,
  styles: [`
    .wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
    }

    .card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2.5rem 2rem;
      width: 100%;
      max-width: 380px;
    }

    .title {
      text-align: center;
      font-size: 1.75rem;
      letter-spacing: 6px;
      color: var(--accent);
      font-weight: 300;
    }

    .subtitle {
      text-align: center;
      font-size: 0.7rem;
      letter-spacing: 8px;
      color: var(--text-secondary);
      text-transform: uppercase;
      margin-bottom: 2rem;
    }

    input {
      display: block;
      width: 100%;
      padding: 0.75rem 1rem;
      margin-bottom: 0.75rem;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 0.9rem;
      transition: border-color 0.2s;
    }

    input:focus {
      border-color: var(--accent);
    }

    input::placeholder {
      color: var(--text-secondary);
    }

    button {
      width: 100%;
      padding: 0.75rem;
      margin-top: 0.5rem;
      background: var(--accent);
      color: #0d0d0d;
      border: none;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      letter-spacing: 3px;
      cursor: pointer;
      transition: background 0.2s;
    }

    button:hover {
      background: var(--accent-hover);
    }

    .error {
      color: var(--error);
      text-align: center;
      margin-top: 0.75rem;
      font-size: 0.85rem;
    }

    .link {
      display: block;
      text-align: center;
      margin-top: 1.25rem;
      font-size: 0.85rem;
    }
  `]
})
export class LoginComponent {
  phone = '';
  password = '';
  error = '';

  constructor(private auth: AuthService, private router: Router) {}

  onSubmit() {
    this.auth.login(this.phone, this.password).subscribe({
      next: (res) => {
        this.auth.saveToken(res.token);
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.error = err.error?.error || 'Login failed';
      }
    });
  }
}
