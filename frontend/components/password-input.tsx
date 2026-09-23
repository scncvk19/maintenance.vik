'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type Props = React.InputHTMLAttributes<HTMLInputElement>;

export default function PasswordInput(props: Props) {
  const [visible, setVisible] = useState(false);
  const { className = '', ...inputProps } = props;
  return <span className="password-field">
    <input {...inputProps} className={className} type={visible ? 'text' : 'password'}/>
    <button
      className="password-toggle"
      type="button"
      aria-label={visible ? 'Passwort verbergen' : 'Passwort anzeigen'}
      aria-pressed={visible}
      onClick={() => setVisible(value => !value)}
    >
      {visible ? <EyeOff size={17}/> : <Eye size={17}/>}
    </button>
  </span>;
}
