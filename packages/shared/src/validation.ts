/**
 * Validation utilities including SSRF protection.
 */

import { SSRFProtectionError, ValidationError } from './errors.js';

const BLOCKED_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '169.254.169.254', // AWS metadata
  '::1', // IPv6 loopback
];

const BLOCKED_RANGES = [
  { start: 10, end: 10 }, // 10.0.0.0/8
  { start: 172, end: 31 }, // 172.16.0.0/12
  { start: 192, end: 168 }, // 192.168.0.0/16
];

export function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;

  const firstOctet = parseInt(parts[0], 10);

  for (const range of BLOCKED_RANGES) {
    if (firstOctet >= range.start && firstOctet <= range.end) {
      return true;
    }
  }

  return false;
}

export function validateDestinationURL(url: string): void {
  if (!url || url.trim().length === 0) {
    throw new ValidationError('Destination URL cannot be empty');
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname || '';

    // Check blocked hostnames
    if (BLOCKED_HOSTNAMES.includes(hostname.toLowerCase())) {
      throw new SSRFProtectionError(url);
    }

    // Check private IP ranges
    if (isPrivateIP(hostname)) {
      throw new SSRFProtectionError(url);
    }

    // Check for valid protocol
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new ValidationError(`Invalid URL protocol: ${parsed.protocol}`);
    }
  } catch (err) {
    if (err instanceof SSRFProtectionError) {
      throw err;
    }
    if (err instanceof ValidationError) {
      throw err;
    }
    throw new ValidationError(`Invalid URL format: ${url}`);
  }
}

export function validateApiKeyName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new ValidationError('API key name cannot be empty');
  }

  if (name.length > 255) {
    throw new ValidationError('API key name cannot exceed 255 characters');
  }
}

export function validateDestinationName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new ValidationError('Destination name cannot be empty');
  }

  if (name.length > 255) {
    throw new ValidationError('Destination name cannot exceed 255 characters');
  }
}

export function validateHTTPMethod(method: string): method is 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' {
  return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
}

export function validateTimeout(ms: number): void {
  if (ms < 1000 || ms > 300000) {
    throw new ValidationError('Timeout must be between 1000ms and 300000ms');
  }
}

export function validateConcurrency(limit: number): void {
  if (limit < 1 || limit > 1000) {
    throw new ValidationError('Concurrency limit must be between 1 and 1000');
  }
}

export function validateRateLimit(value: number, unit: string): void {
  if (value < 1 || value > 10000) {
    throw new ValidationError('Rate limit value must be between 1 and 10000');
  }

  if (!['second', 'minute', 'hour'].includes(unit)) {
    throw new ValidationError('Rate limit unit must be second, minute, or hour');
  }
}

export function validateMaxAttempts(attempts: number): void {
  if (attempts < 1 || attempts > 10) {
    throw new ValidationError('Max attempts must be between 1 and 10');
  }
}

export function validatePayloadSize(payload: unknown): void {
  const serialized = JSON.stringify(payload);
  const sizeInMB = Buffer.byteLength(serialized, 'utf8') / (1024 * 1024);

  if (sizeInMB > 10) {
    throw new ValidationError(`Payload size cannot exceed 10MB (current: ${sizeInMB.toFixed(2)}MB)`);
  }
}

export function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}
