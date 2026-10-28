export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export const unauthorized = () => new AppError(401, 'AUTH_REQUIRED', '잠긴 공간입니다. 패스키로 다시 로그인해 주세요.');
export const denied = () => new AppError(403, 'FORBIDDEN', '이 자료에 접근할 권한이 없습니다.');
export const invalidCeremony = () => new AppError(400, 'INVALID_CEREMONY', '인증을 확인할 수 없습니다. 새로 시작해 주세요.');
