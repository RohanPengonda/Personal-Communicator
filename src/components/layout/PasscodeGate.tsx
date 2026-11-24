import React, { useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';

interface PasscodeGateProps {
  onUnlock: (passcode: string) => void;
}

export const PasscodeGate: React.FC<PasscodeGateProps> = ({ onUnlock }) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!value.trim()) {
      setError('Enter the passcode set in .env (APP_PASSCODE).');
      return;
    }
    setError('');
    onUnlock(value.trim());
  };

  return (
    <div className="gate-shell">
      <form className="gate-card" onSubmit={submit}>
        <div className="gate-icon"><ShieldCheck className="w-6 h-6" /></div>
        <h1>Private access</h1>
        <p>This app is passcode-protected. Enter the passcode from your server configuration.</p>
        <label>
          <Lock className="w-4 h-4" />
          <input
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Passcode"
            autoFocus
          />
        </label>
        {error && <p className="gate-error">{error}</p>}
        <button type="submit" className="primary-action">Unlock</button>
      </form>
    </div>
  );
};
