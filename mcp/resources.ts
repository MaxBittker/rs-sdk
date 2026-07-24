import { resolve } from 'path';

export const SDK_API_RESOURCE_URI = 'file://../sdk/API.md';

export interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  filePath: string;
}

export function getResourceDefinitions(mcpDirectory = import.meta.dir): ResourceDefinition[] {
  return [{
    uri: SDK_API_RESOURCE_URI,
    name: 'SDK API Reference',
    description: 'Auto-generated reference for bot.* high-level actions and sdk.* low-level methods.',
    mimeType: 'text/markdown',
    filePath: resolve(mcpDirectory, '../sdk/API.md'),
  }];
}

export async function readAllowedResource(uri: string, mcpDirectory = import.meta.dir): Promise<{
  uri: string;
  mimeType: string;
  text: string;
}> {
  // Resource URIs are capabilities, not arbitrary local paths. Exact matching
  // prevents ../ traversal and absolute file reads through the MCP endpoint.
  const resource = getResourceDefinitions(mcpDirectory).find(candidate => candidate.uri === uri);
  if (!resource) {
    throw new Error(`Unknown resource URI: ${uri}`);
  }

  return {
    uri: resource.uri,
    mimeType: resource.mimeType,
    text: await Bun.file(resource.filePath).text(),
  };
}
