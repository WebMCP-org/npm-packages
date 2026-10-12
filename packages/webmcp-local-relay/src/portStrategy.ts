import type { AddressInfo } from 'node:net';

export function isTcpAddress(address: AddressInfo | string | null): address is AddressInfo {
  return address !== null && typeof address !== 'string';
}

export const DEFAULT_RELAY_PORT = 9333;
export const DEFAULT_RELAY_PORT_RANGE_END = 9348;
