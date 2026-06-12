/**
 * ASC JWT auth — ES256 signed token, valid for 20 minutes.
 * Apple docs: https://developer.apple.com/documentation/appstoreconnectapi/generating_tokens_for_api_requests
 */
import fs from 'fs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { AscCredentials } from './types';

let _cachedToken: string | null = null;
let _tokenExpiry: number = 0;

export function generateToken(creds: AscCredentials): string {
  const now = Math.floor(Date.now() / 1000);

  // Reuse cached token if still valid (with 60s buffer)
  if (_cachedToken && now < _tokenExpiry - 60) {
    return _cachedToken;
  }

  if (!fs.existsSync(creds.privateKeyPath)) {
    throw new Error(
      `Private key not found at: ${creds.privateKeyPath}\n` +
      `Download it from App Store Connect → Users and Access → Keys`
    );
  }

  const privateKey = fs.readFileSync(creds.privateKeyPath, 'utf8');

  const signOpts: SignOptions & { header?: object } = {
    algorithm: 'ES256',
    expiresIn: '20m',
    audience: 'appstoreconnect-v1',
    issuer: creds.issuerId,
    header: { alg: 'ES256', kid: creds.keyId, typ: 'JWT' },
  };
  _cachedToken = jwt.sign({}, privateKey, signOpts as SignOptions);

  _tokenExpiry = now + 20 * 60;
  return _cachedToken;
}

export function clearTokenCache(): void {
  _cachedToken = null;
  _tokenExpiry = 0;
}
