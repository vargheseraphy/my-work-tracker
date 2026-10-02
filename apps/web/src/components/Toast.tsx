/** A short message at the foot of the page, announced to screen readers. */

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

interface ToastApi {
  show: (message: string) => void;
}

const Context = createContext<ToastApi>({ show: () => undefined });

export function useToast(): ToastApi {
  return useContext(Context);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback((text: string) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 3200);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <Context.Provider value={api}>
      {children}
      <div aria-live="polite" aria-atomic="true">
        {message ? (
          <div className="toast" role="status">
            {message}
          </div>
        ) : null}
      </div>
    </Context.Provider>
  );
}
