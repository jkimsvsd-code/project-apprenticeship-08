import { useState, type FormEvent } from 'react';
import { Fingerprint, LoaderCircle, Plus } from 'lucide-react';
import { providers, type Provider, type RegistrationMethod } from '../../shared/contracts.js';
import { EnvironmentNotice, Status } from '../shared/components.js';
import { useCeremony } from './useCeremony.js';

export function RegistrationForm({ initial = false, onSuccess }: { initial?: boolean; onSuccess: () => Promise<void> }) {
  const [name, setName] = useState(initial ? '나의 첫 패스키' : '나의 예비 패스키');
  const [provider, setProvider] = useState<Provider>('기타 / 확인하지 못함');
  const [method, setMethod] = useState<RegistrationMethod>('device');
  const ceremony = useCeremony();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ceremony.register({ name: name.trim(), provider, method }, onSuccess);
  };
  return <form className="registration-form" onSubmit={submit} aria-busy={ceremony.busy}>
    <div className="field"><label htmlFor="passkey-name">패스키 이름</label>
      <input id="passkey-name" name="passkey-name" value={name} onChange={event => setName(event.target.value)} required minLength={1} maxLength={40} disabled={ceremony.busy} autoComplete="off" aria-describedby="passkey-name-help" />
      <p id="passkey-name-help" className="field-help">예: 내 노트북, 예비 보안 키. 실제 연락처는 넣지 마세요.</p></div>
    <div className="field"><label htmlFor="registration-method">패스키 등록 방식</label>
      <select id="registration-method" value={method} onChange={event => setMethod(event.target.value as RegistrationMethod)} disabled={ceremony.busy} aria-describedby="registration-method-help">
        <option value="device">이 기기의 저장소 (Google·iCloud 등)</option>
        <option value="phone">다른 기기에서 등록 (QR)</option>
        <option value="security-key">USB·NFC 보안 키</option>
        <option value="auto">브라우저에서 선택</option>
      </select>
      <p id="registration-method-help" className="field-help">이 선택은 실제 브라우저 등록 요청에 적용돼요. Google·iCloud 중 최종 저장 제공자는 다음 인증 창에서 선택하며, 설치·설정된 제공자만 사용할 수 있어요. 환경에 따라 브라우저가 다른 경로를 함께 제시할 수 있어요.</p>
    </div>
    <p className="registration-storage-guide">같은 iPhone에도 서로 다른 제공자의 패스키를 등록할 수 있어요. 다만 두 제공자가 기기·브라우저에 설정되어 있어야 해요. 아래 안내에서 준비 방법을 확인해 주세요.</p>
    <details className="storage-memo">
      <summary>저장소 메모 남기기 (선택)</summary>
      <p id="provider-help" className="field-help">아래 값은 사용자 메모예요. 값을 바꿔도 실제 저장소는 바뀌지 않으며, 서비스가 확인한 정보도 아니에요. 저장소를 모르면 ‘기타 / 확인하지 못함’으로 두세요.</p>
      <div className="field"><label htmlFor="passkey-provider">기록할 저장소 메모</label>
      <select id="passkey-provider" value={provider} onChange={event => setProvider(event.target.value as Provider)} disabled={ceremony.busy} aria-describedby="provider-help">
        {providers.map(value => <option key={value}>{value}</option>)}
      </select></div>
    </details>
    <button className="button primary full-width" type="submit" disabled={ceremony.busy || !name.trim()}>
      {ceremony.busy ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : initial ? <Fingerprint size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
      {ceremony.busy ? '패스키 확인 중…' : initial ? '첫 패스키 등록' : '예비 패스키 등록'}
    </button>
    {ceremony.phase === 'device' && <button type="button" className="button text-button full-width" onClick={ceremony.cancel}>등록 취소</button>}
    <Status message={ceremony.message} kind={ceremony.phase === 'error' || ceremony.phase === 'timeout' ? 'error' : ceremony.phase === 'success' ? 'success' : 'info'} />
    <EnvironmentNotice />
  </form>;
}
