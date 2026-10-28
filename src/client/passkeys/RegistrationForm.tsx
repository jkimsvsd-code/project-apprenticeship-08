import { useState, type FormEvent } from 'react';
import { Fingerprint, LoaderCircle, Plus } from 'lucide-react';
import { providers, type Provider } from '../../shared/contracts.js';
import { EnvironmentNotice, Status } from '../shared/components.js';
import { useCeremony } from './useCeremony.js';

export function RegistrationForm({ initial = false, onSuccess }: { initial?: boolean; onSuccess: () => Promise<void> }) {
  const [name, setName] = useState(initial ? '나의 첫 패스키' : '나의 예비 패스키');
  const [provider, setProvider] = useState<Provider>('기타 / 확인하지 못함');
  const ceremony = useCeremony();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ceremony.register({ name: name.trim(), provider }, onSuccess);
  };
  return <form className="registration-form" onSubmit={submit} aria-busy={ceremony.busy}>
    <div className="field"><label htmlFor="passkey-name">패스키 이름</label>
      <input id="passkey-name" name="passkey-name" value={name} onChange={event => setName(event.target.value)} required minLength={1} maxLength={40} disabled={ceremony.busy} autoComplete="off" aria-describedby="passkey-name-help" />
      <p id="passkey-name-help" className="field-help">예: 내 노트북, 예비 보안 키. 실제 연락처는 넣지 마세요.</p></div>
    <div className="field"><label htmlFor="passkey-provider">저장 위치</label>
      <select id="passkey-provider" value={provider} onChange={event => setProvider(event.target.value as Provider)} disabled={ceremony.busy} aria-describedby="provider-help">
        {providers.map(value => <option key={value}>{value}</option>)}
      </select><p id="provider-help" className="field-help">기기 창에서 실제 선택한 위치를 기록해 주세요. 자동으로 확인되는 정보는 아니에요.</p></div>
    <button className="button primary full-width" type="submit" disabled={ceremony.busy || !name.trim()}>
      {ceremony.busy ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : initial ? <Fingerprint size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
      {ceremony.busy ? '패스키 확인 중…' : initial ? '첫 패스키 등록' : '예비 패스키 등록'}
    </button>
    {ceremony.phase === 'device' && <button type="button" className="button text-button full-width" onClick={ceremony.cancel}>등록 취소</button>}
    <Status message={ceremony.message} kind={ceremony.phase === 'error' || ceremony.phase === 'timeout' ? 'error' : ceremony.phase === 'success' ? 'success' : 'info'} />
    <EnvironmentNotice />
  </form>;
}
