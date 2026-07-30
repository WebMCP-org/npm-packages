import type { RuntimeContractController } from '../../runtime-contract/core.js';
import type { Client } from '@modelcontextprotocol/client';

declare global {
  interface Window {
    __WEBMCP_E2E__?: RuntimeContractController;
    mcpClient?: Client;
  }
}
