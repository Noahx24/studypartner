/**
 * Token storage abstraction.
 *
 * Native (iOS / Android): Keychain / EncryptedSharedPreferences via
 *   capacitor-secure-storage-plugin. Encrypted at rest, isolated from
 *   the webview's localStorage, and survives app updates.
 *
 * Web (dev / fallback): localStorage. Less secure (any JS in the
 *   webview can read it), but the web build is dev-only since the
 *   Moodle launch flow requires the native shell anyway.
 *
 * Reads are sync via an in-memory cache that's populated at app
 * startup; writes are async. Call `loadFromStorage()` once before any
 * sync read happens — AuthProvider does this on mount.
 *
 * Residual XSS risk applies to both backends — the webview's JS can
 * call `getToken()` regardless of where it's persisted. The mitigation
 * for that is a strong CSP at the server / Capacitor config level
 * (separately tracked).
 */
import { Capacitor } from '@capacitor/core';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';

const TOKEN_KEY = 'studypartner_token';

let cachedToken: string | null = null;
let loaded = false;

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

export const loadTokenFromStorage = async (): Promise<string | null> => {
  if (loaded) return cachedToken;
  try {
    if (isNative()) {
      const { value } = await SecureStoragePlugin.get({ key: TOKEN_KEY });
      cachedToken = value || null;
    } else {
      cachedToken = window.localStorage.getItem(TOKEN_KEY);
    }
  } catch {
    // SecureStoragePlugin throws if the key doesn't exist — that's a
    // valid "no token" state, not a real failure.
    cachedToken = null;
  }
  loaded = true;
  return cachedToken;
};

export const setToken = async (token: string): Promise<void> => {
  cachedToken = token;
  loaded = true;
  if (isNative()) {
    await SecureStoragePlugin.set({ key: TOKEN_KEY, value: token });
  } else {
    window.localStorage.setItem(TOKEN_KEY, token);
  }
};

export const clearToken = async (): Promise<void> => {
  cachedToken = null;
  loaded = true;
  if (isNative()) {
    try {
      await SecureStoragePlugin.remove({ key: TOKEN_KEY });
    } catch {
      // Already missing — fine.
    }
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
};

/** Sync read for hot paths (every request header). Returns null if
 *  loadTokenFromStorage() hasn't completed yet. */
export const getToken = (): string | null => cachedToken;
