import { useEffect, useRef, useState } from 'react';
import {
  startAuthentication, startRegistration, WebAuthnAbortService,
  type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import type { Provider, RegistrationMethod } from '../../shared/contracts.js';
import { ApiError, post } from '../shared/api.js';

type Phase = 'ready' | 'preparing' | 'device' | 'verifying' | 'success' | 'cancelled' | 'timeout' | 'error';
const messages: Record<Phase, string> = {
  ready: '', preparing: '안전한 인증 요청을 준비하고 있어요.', device: '기기의 안내에서 지문·얼굴·기기 잠금 해제를 확인해 주세요.',
  verifying: '서버에서 인증을 확인하고 있어요.', success: '확인했어요. 잠시만 기다려 주세요.',
  cancelled: '인증이 취소되었어요. 준비되면 다시 시도해 주세요.', timeout: '응답 시간이 지났어요. 다시 시도하면 새 요청으로 시작해요.',
  error: '인증을 완료하지 못했어요. 다시 시도해 주세요.',
};

export function useCeremony() {
  const [phase, setPhase] = useState<Phase>('ready');
  const [message, setMessage] = useState('');
  const active = useRef(false);
  const mounted = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const reason = useRef<'cancelled' | 'timeout' | null>(null);
  useEffect(() => () => {
    mounted.current = false;
    if (active.current) { reason.current = 'cancelled'; abort.current?.abort(); WebAuthnAbortService.cancelCeremony(); }
  }, []);
  function update(next: Phase, text = messages[next]) { if (mounted.current) { setPhase(next); setMessage(text); } }
  async function run(kind: 'registration' | 'authentication', fields: { name: string; provider: Provider; method: RegistrationMethod } | null, onSuccess: () => Promise<void>) {
    if (active.current) return;
    if (!window.isSecureContext || typeof window.PublicKeyCredential !== 'function') { update('error', '현재 환경에서는 패스키를 사용할 수 없어요. 아래 환경 안내를 확인해 주세요.'); return; }
    active.current = true; reason.current = null; abort.current = new AbortController();
    let challengeId: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      update('preparing');
      const result = await post<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON | PublicKeyCredentialRequestOptionsJSON }>(
        `/api/auth/${kind}/options`, fields ? { method: fields.method } : {}, { signal: abort.current.signal },
      );
      challengeId = result.challengeId;
      if (!mounted.current || reason.current) throw new DOMException('Cancelled', 'AbortError');
      update('device');
      timer = setTimeout(() => { reason.current = 'timeout'; WebAuthnAbortService.cancelCeremony(); }, 60_000);
      const response = kind === 'registration'
        ? await startRegistration({ optionsJSON: result.options as PublicKeyCredentialCreationOptionsJSON })
        : await startAuthentication({ optionsJSON: result.options as PublicKeyCredentialRequestOptionsJSON });
      clearTimeout(timer);
      if (reason.current || !mounted.current) throw new DOMException('Cancelled', 'AbortError');
      update('verifying');
      await post(`/api/auth/${kind}/verify`, { challengeId, response, ...(fields ? { name: fields.name, provider: fields.provider } : {}) }, { signal: abort.current.signal });
      challengeId = undefined;
      update('success');
      await onSuccess();
    } catch (error) {
      if (reason.current) update(reason.current);
      else if (error instanceof ApiError) update('error', error.message);
      else {
        const name = error instanceof Error ? error.name : '';
        update(name === 'NotAllowedError' || name === 'AbortError' ? 'cancelled' : 'error',
          name === 'InvalidStateError' ? '선택한 인증기에 이미 등록된 패스키가 있어요. 브라우저·기기 창의 ‘다른 옵션’에서 별도 저장소나 보안 키를 선택해 주세요. 저장소 메모를 바꿔도 실제 저장소는 바뀌지 않아요.'
          : name === 'NotAllowedError' ? '기기 확인이 취소되었거나 시간이 지났어요. 준비되면 다시 시도해 주세요.'
          : name === 'ConstraintError' || name === 'NotSupportedError' ? '이 브라우저에서 선택한 등록 방식을 사용할 수 없어요. ‘브라우저에서 선택’을 시도하거나, 원하는 저장소가 설정된 Chrome·Safari에서 열어 주세요.'
          : name === 'SecurityError' ? '이 주소에서 패스키를 사용할 수 없어요. 원래 등록한 주소인지 확인해 주세요.'
          : messages[name === 'AbortError' ? 'cancelled' : 'error']);
      }
    } finally {
      clearTimeout(timer);
      if (challengeId) await post('/api/auth/cancel', { challengeId }, { keepalive: true }).catch(() => {});
      active.current = false;
    }
  }
  return {
    phase, message, busy: ['preparing', 'device', 'verifying'].includes(phase),
    register: (fields: { name: string; provider: Provider; method: RegistrationMethod }, success: () => Promise<void>) => run('registration', fields, success),
    login: (success: () => Promise<void>) => run('authentication', null, success),
    cancel: () => { reason.current = 'cancelled'; abort.current?.abort(); WebAuthnAbortService.cancelCeremony(); },
  };
}
