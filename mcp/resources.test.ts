import { describe, expect, test } from 'bun:test';
import { SDK_API_RESOURCE_URI, getResourceDefinitions, readAllowedResource } from './resources';

describe('MCP resources', () => {
  test('reads the advertised API resource', async () => {
    const resources = getResourceDefinitions();
    expect(resources.map(resource => resource.uri)).toEqual([SDK_API_RESOURCE_URI]);
    const content = await readAllowedResource(SDK_API_RESOURCE_URI);
    expect(content.text).toContain('# SDK API Reference');
    expect(content.mimeType).toBe('text/markdown');
  });

  test('rejects traversal and arbitrary absolute files', async () => {
    await expect(readAllowedResource('file://../../../../etc/passwd')).rejects.toThrow('Unknown resource URI');
    await expect(readAllowedResource('file:///etc/passwd')).rejects.toThrow('Unknown resource URI');
    await expect(readAllowedResource('https://example.com/API.md')).rejects.toThrow('Unknown resource URI');
  });
});
