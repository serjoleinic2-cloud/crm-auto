import { useState, useEffect } from 'react';
import { ipcService } from '../services/ipcService';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  isFirstRun: boolean | null;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    isFirstRun: null,
    error: null,
  });

  useEffect(() => {
    ipcService.auth.isFirstRun().then(firstRun => {
      setState(s => ({ ...s, isLoading: false, isFirstRun: firstRun }));
    }).catch(() => {
      setState(s => ({ ...s, isLoading: false, isFirstRun: false }));
    });
  }, []);

  const setPin = async (pin: string) => {
    if (pin.length < 4) {
      setState(s => ({ ...s, error: 'PIN должен быть не менее 4 цифр' }));
      return;
    }
    setState(s => ({ ...s, error: null }));
    try {
      await ipcService.auth.setPin(pin);
      setState(s => ({ ...s, isAuthenticated: true, isFirstRun: false }));
    } catch {
      setState(s => ({ ...s, error: 'Ошибка создания PIN' }));
    }
  };

  const verifyPin = async (pin: string) => {
    setState(s => ({ ...s, error: null }));
    try {
      const ok = await ipcService.auth.verifyPin(pin);
      if (ok) {
        setState(s => ({ ...s, isAuthenticated: true }));
      } else {
        setState(s => ({ ...s, error: 'Неверный PIN' }));
      }
    } catch {
      setState(s => ({ ...s, error: 'Ошибка проверки PIN' }));
    }
  };

  return {
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,
    isFirstRun: state.isFirstRun,
    error: state.error,
    setPin,
    verifyPin,
  };
}
