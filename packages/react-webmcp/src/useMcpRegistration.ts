import type { RegistrationHandle } from '@mcp-b/webmcp-types';
import { useEffect, useState } from 'react';

export function useMcpRegistration(register: () => RegistrationHandle | undefined): boolean {
  const [isRegistered, setIsRegistered] = useState(false);

  useEffect(() => {
    const registration = register();
    if (!registration) {
      setIsRegistered(false);
      return;
    }

    setIsRegistered(true);
    return () => {
      registration.unregister();
    };
  }, [register]);

  return isRegistered;
}
