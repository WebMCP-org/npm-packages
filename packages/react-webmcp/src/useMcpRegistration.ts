import type { RegistrationHandle } from '@mcp-b/webmcp-types';
import { useEffect, useState } from 'react';

export function useMcpRegistration(
  register: () => RegistrationHandle | undefined,
  enabled = true
): boolean {
  const [isRegistered, setIsRegistered] = useState(false);

  useEffect(() => {
    const registration = enabled ? register() : undefined;
    if (!registration) {
      setIsRegistered(false);
      return;
    }

    setIsRegistered(true);
    return () => {
      registration.unregister();
    };
  }, [register, enabled]);

  return isRegistered;
}
