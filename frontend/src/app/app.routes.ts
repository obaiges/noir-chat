import { Routes } from '@angular/router';
import { AuthGuard } from './auth.guard';
import { LoginComponent } from './pages/login.component';
import { RegisterComponent } from './pages/register.component';
import { HomeComponent } from './pages/home.component';
import { ChatRoomComponent } from './pages/chat-room.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: '', component: HomeComponent, canActivate: [AuthGuard] },
  { path: 'chat/:id', component: ChatRoomComponent, canActivate: [AuthGuard] },
  { path: '**', redirectTo: '' }
];
