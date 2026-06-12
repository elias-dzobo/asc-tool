/**
 * ASC REST API client — thin axios wrapper with JWT auth and error formatting.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { generateToken } from './auth';
import type { AscCredentials } from './types';

const BASE_URL = 'https://api.appstoreconnect.apple.com/v1';

export function createClient(creds: AscCredentials): AxiosInstance {
  const client = axios.create({ baseURL: BASE_URL });

  // Attach fresh JWT before every request
  client.interceptors.request.use(config => {
    config.headers['Authorization'] = `Bearer ${generateToken(creds)}`;
    config.headers['Content-Type'] = 'application/json';
    return config;
  });

  // Format ASC error responses into readable messages
  client.interceptors.response.use(
    r => r,
    (err: AxiosError<{ errors?: Array<{ title: string; detail: string; code: string }> }>) => {
      const ascErrors = err.response?.data?.errors;
      if (ascErrors?.length) {
        const msg = ascErrors
          .map(e => `[${e.code}] ${e.title}: ${e.detail}`)
          .join('\n');
        throw new Error(`App Store Connect API error:\n${msg}`);
      }
      throw err;
    },
  );

  return client;
}

export type AscClient = AxiosInstance;
