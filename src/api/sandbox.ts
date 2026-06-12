/**
 * /v1/sandboxTesters — create and list sandbox test accounts.
 */
import type { AscClient } from '../client';
import type { SandboxTester } from '../types';

interface AscSandboxTester {
  id: string;
  attributes: {
    firstName: string;
    lastName: string;
    email: string;
    territory: string;
  };
}

export async function listSandboxTesters(
  client: AscClient,
): Promise<AscSandboxTester[]> {
  const res = await client.get<{ data: AscSandboxTester[] }>(
    '/sandboxTesters',
    {
      params: {
        'fields[sandboxTesters]': 'firstName,lastName,email,territory',
        limit: 100,
      },
    },
  );
  return res.data.data;
}

export async function createSandboxTester(
  client: AscClient,
  tester: SandboxTester,
): Promise<AscSandboxTester> {
  const res = await client.post<{ data: AscSandboxTester }>(
    '/sandboxTesters',
    {
      data: {
        type: 'sandboxTesters',
        attributes: {
          firstName: tester.firstName,
          lastName: tester.lastName,
          email: tester.email,
          password: tester.password,
          confirmPassword: tester.password,
          secretQuestion: 'What is your pet\'s name?',
          secretAnswer: 'test',
          birthDate: '1990-01-01',
          territory: tester.territory,
          applePayCompatible: false,
        },
      },
    },
  );
  return res.data.data;
}

export async function findSandboxTesterByEmail(
  client: AscClient,
  email: string,
): Promise<AscSandboxTester | null> {
  const testers = await listSandboxTesters(client);
  return testers.find(t => t.attributes.email === email) ?? null;
}
