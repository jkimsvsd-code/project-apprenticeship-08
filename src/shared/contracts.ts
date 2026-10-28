export interface UserSummary { id: string; displayName: string }
export interface SessionSummary { user: UserSummary | null; expiresAt?: number }
export interface PrivateItem { id: string; title: string; body: string; category: string }
export const providers = ['기기 자체', 'Google 비밀번호 관리자', 'iCloud 키체인', '보안 키', '기타 / 확인하지 못함'] as const;
export type Provider = typeof providers[number];
export const registrationMethods = ['device', 'phone', 'security-key', 'auto'] as const;
export type RegistrationMethod = typeof registrationMethods[number];
export interface PasskeySummary {
  id: string;
  name: string;
  provider: Provider;
  createdAt: number;
  deviceType: string;
  backedUp: boolean;
  current: boolean;
}
export interface ApiErrorBody { error: { code: string; message: string } }

// Only these destinations can be restored after authentication (no open redirects).
export function safeReturnTo(input: string | null | undefined): '/vault' | '/passkeys' {
  return input === '/passkeys' ? '/passkeys' : '/vault';
}
