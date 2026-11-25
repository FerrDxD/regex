import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateAlias,
  detectDeviceType,
  detectOS,
  detectBrowser,
  saveDeviceIdentity,
  loadDeviceIdentity,
  type DeviceIdentity,
} from './identity';

describe('identity utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Reset session alias for generateAlias tests
    vi.resetModules();
  });

  describe('generateAlias', () => {
    it('returns a non-empty string', () => {
      const alias = generateAlias();
      expect(typeof alias).toBe('string');
      expect(alias.length).toBeGreaterThan(0);
    });

    it('returns consistent alias within same session', () => {
      const alias1 = generateAlias();
      const alias2 = generateAlias();
      expect(alias1).toBe(alias2);
    });

    it('follows "Adjective Animal" format', () => {
      const alias = generateAlias();
      const parts = alias.split(' ');
      expect(parts.length).toBe(2);
      expect(parts[0]).toMatch(/^[A-Z][a-z]+$/);
      expect(parts[1]).toMatch(/^[A-Z][a-z]+$/);
    });
  });

  describe('detectDeviceType', () => {
    it('returns either desktop or mobile', () => {
      const deviceType = detectDeviceType();
      expect(['desktop', 'mobile']).toContain(deviceType);
    });

    it('returns mobile for mobile user agent', () => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)' });
      vi.stubGlobal('window', { innerWidth: 375 });
      expect(detectDeviceType()).toBe('mobile');
    });

    it('returns mobile for small screen width', () => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
      vi.stubGlobal('window', { innerWidth: 500 });
      expect(detectDeviceType()).toBe('mobile');
    });

    it('returns desktop for desktop user agent and large screen', () => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
      vi.stubGlobal('window', { innerWidth: 1920 });
      expect(detectDeviceType()).toBe('desktop');
    });
  });

  describe('detectOS', () => {
    it('returns a string', () => {
      const os = detectOS();
      expect(typeof os).toBe('string');
      expect(os.length).toBeGreaterThan(0);
    });

    it('detects Windows', () => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
      expect(detectOS()).toBe('Windows');
    });

    it('detects macOS', () => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' });
      expect(detectOS()).toBe('macOS');
    });

    it('detects Linux', () => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' });
      expect(detectOS()).toBe('Linux');
    });

    it('detects Android', () => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 10)' });
      expect(detectOS()).toBe('Android');
    });

    it('detects iOS', () => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)' });
      expect(detectOS()).toBe('iOS');
    });
  });

  describe('detectBrowser', () => {
    it('returns a string', () => {
      const browser = detectBrowser();
      expect(typeof browser).toBe('string');
      expect(browser.length).toBeGreaterThan(0);
    });

    it('detects Chrome', () => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' });
      expect(detectBrowser()).toBe('Chrome');
    });

    it('detects Firefox', () => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0' });
      expect(detectBrowser()).toBe('Firefox');
    });

    it('detects Safari', () => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15' });
      expect(detectBrowser()).toBe('Safari');
    });

    it('detects Edge', () => {
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0' });
      expect(detectBrowser()).toBe('Edge');
    });
  });

  describe('saveDeviceIdentity and loadDeviceIdentity', () => {
    it('round-trips identity through localStorage', () => {
      const identity: DeviceIdentity = {
        alias: 'Cobalt Fox',
        deviceType: 'desktop',
        os: 'Windows',
        browser: 'Chrome',
      };

      saveDeviceIdentity(identity);
      const loaded = loadDeviceIdentity();

      expect(loaded).not.toBeNull();
      expect(loaded?.alias).toBe('Cobalt Fox');
      expect(loaded?.deviceType).toBe('desktop');
      expect(loaded?.os).toBe('Windows');
      expect(loaded?.browser).toBe('Chrome');
    });

    it('returns null when localStorage is empty', () => {
      const loaded = loadDeviceIdentity();
      expect(loaded).toBeNull();
    });

    it('returns null for invalid stored data', () => {
      localStorage.setItem('regex_device_identity', 'not-json');
      const loaded = loadDeviceIdentity();
      expect(loaded).toBeNull();
    });

    it('returns null for malformed identity object', () => {
      localStorage.setItem('regex_device_identity', JSON.stringify({ alias: 'test' }));
      const loaded = loadDeviceIdentity();
      expect(loaded).toBeNull();
    });

    it('handles localStorage errors gracefully', () => {
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('Quota exceeded');
      });

      expect(() => saveDeviceIdentity({
        alias: 'Test',
        deviceType: 'desktop',
        os: 'Windows',
        browser: 'Chrome',
      })).not.toThrow();

      vi.spyOn(localStorage, 'setItem').mockRestore();
    });
  });
});