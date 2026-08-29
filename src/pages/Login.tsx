import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Shield } from 'lucide-react';

interface Props {
  isFirstRun: boolean;
}

export default function Login({ isFirstRun }: Props) {
  const [pin, setPin] = useState('');
  const { setPin: savePin, verifyPin, error } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isFirstRun) {
      await savePin(pin);
    } else {
      await verifyPin(pin);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <div className="bg-primary-100 p-3 rounded-full">
            <Shield className="text-primary-600" size={32} />
          </div>
        </div>
        <h1 className="text-xl font-bold text-center mb-2">CRM Auto</h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          {isFirstRun ? 'Создайте PIN для входа' : 'Введите PIN для входа'}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="••••••"
            className="input text-center text-2xl tracking-widest"
            autoFocus
          />
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          <button type="submit" className="btn-primary w-full">
            {isFirstRun ? 'Создать PIN' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}