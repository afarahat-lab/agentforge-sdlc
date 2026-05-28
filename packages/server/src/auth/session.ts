/**
 * Session management — JWT issuance and validation using jose (Web Crypto API).
 * jose is used instead of jsonwebtoken as it supports Node.js 20+ native crypto.
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { PlatformUser } from '../types';

export interface JwtPayload extends JWTPayload {
  sub: string;
  email: string;
  role: string;
  provider: string;
}

export interface SessionConfig {
  jwtSecret: string;
  sessionTtlMinutes: number;
}

function getSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * Issues a signed JWT for an authenticated platform user.
 */
export async function issueToken(user: PlatformUser, config: SessionConfig): Promise<string> {
  const secret = getSecretKey(config.jwtSecret);
  const expiresIn = config.sessionTtlMinutes * 60;  // seconds

  return new SignJWT({
    email: user.email,
    role: user.role,
    provider: user.authProvider,
  } satisfies Omit<JwtPayload, 'sub'>)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(secret);
}

/**
 * Validates a JWT and returns its payload.
 * Throws if invalid, expired, or tampered with.
 */
export async function verifyToken(token: string, config: SessionConfig): Promise<JwtPayload> {
  const secret = getSecretKey(config.jwtSecret);
  const { payload } = await jwtVerify(token, secret);
  return payload as JwtPayload;
}

/**
 * Extracts a bearer token from request headers.
 * Returns null if not present — caller decides if that is an error.
 */
export function extractToken(
  headers: Record<string, string | string[] | undefined>,
  query?: Record<string, string | undefined>,
): string | null {
  const authHeader = headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // SSE connections pass token as query param (EventSource cannot set headers)
  if (query?.['token']) return query['token'];
  return null;
}
