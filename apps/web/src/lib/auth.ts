/**
 * Authentication utilities for admin panel
 * Stores API key in localStorage and provides helper functions
 */

export function getStoredApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('adminApiKey');
}

export function setStoredApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('adminApiKey', key);
}

export function clearStoredApiKey(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('adminApiKey');
}

export function isAuthenticated(): boolean {
  return getStoredApiKey() !== null;
}

export function getAuthHeader(): { Authorization: string } | null {
  const key = getStoredApiKey();
  if (!key) return null;
  return { Authorization: `Bearer ${key}` };
}
