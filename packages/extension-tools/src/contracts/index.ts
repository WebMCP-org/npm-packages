import { alarmContracts, alarmsContracts } from './alarms';
import { cookieContracts, cookiesContracts } from './cookies';
import { downloadContracts, downloadsContracts } from './downloads';
import { permissionContracts, permissionsContracts } from './permissions';
import { runtimeContractList, runtimeContracts } from './runtime';
import { scriptingContractList, scriptingContracts } from './scripting';
import { userScriptContracts, userScriptsContracts } from './userScripts';

export * from './alarms';
export * from './cookies';
export * from './downloads';
export * from './permissions';
export * from './runtime';
export * from './scripting';
export * from './shared';
export * from './userScripts';

export const extensionToolContractGroups = {
  alarms: alarmContracts,
  cookies: cookieContracts,
  downloads: downloadContracts,
  permissions: permissionContracts,
  runtime: runtimeContracts,
  scripting: scriptingContracts,
  userScripts: userScriptContracts,
} as const;

export const allExtensionToolContracts = [
  ...alarmsContracts,
  ...cookiesContracts,
  ...downloadsContracts,
  ...permissionsContracts,
  ...runtimeContractList,
  ...scriptingContractList,
  ...userScriptsContracts,
] as const;

export const extensionToolContractsByName = Object.fromEntries(
  allExtensionToolContracts.map((contract) => [contract.name, contract])
);

export const extensionToolContractsByGroup = {
  alarms: alarmsContracts,
  cookies: cookiesContracts,
  downloads: downloadsContracts,
  permissions: permissionsContracts,
  runtime: runtimeContractList,
  scripting: scriptingContractList,
  userScripts: userScriptsContracts,
} as const;
