/**
 * 2Captcha Proxy Provider Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TwoCaptchaProxyProvider,
  createTwoCaptchaProvider,
} from '../../providers/two-captcha.js';
import {
  TWOCAPTCHA_LOCATION_MAP,
  getTwoCaptchaGeoTarget,
  isTwoCaptchaLocationSupported,
  getTwoCaptchaSupportedLocations,
  buildTwoCaptchaUsername,
} from '../../providers/two-captcha-locations.js';
import { ProxyManager } from '../../manager.js';

describe('TwoCaptchaProxyProvider', () => {
  let provider: TwoCaptchaProxyProvider;

  beforeEach(() => {
    provider = new TwoCaptchaProxyProvider({
      apiKey: 'test-api-key-12345',
    });
  });

  describe('constructor', () => {
    it('should create provider with required config', () => {
      expect(provider.name).toBe('2captcha');
    });

    it('should use default values for optional config', () => {
      expect(provider.isEnabled()).toBe(true);
      expect(provider.getPriority()).toBe(50);
      expect(provider.getCostPerGb()).toBe(5.0);
    });

    it('should accept custom config values', () => {
      const customProvider = new TwoCaptchaProxyProvider({
        apiKey: 'test-key',
        enabled: false,
        priority: 10,
        defaultSessionDuration: 10,
        defaultProtocol: 'socks5',
      });

      expect(customProvider.isEnabled()).toBe(false);
      expect(customProvider.getPriority()).toBe(10);
    });
  });

  describe('getProxyConfig', () => {
    it('should generate proxy config for US NYC location', () => {
      const config = provider.getProxyConfig('us-nyc');

      expect(config.type).toBe('residential');
      expect(config.protocol).toBe('http');
      expect(config.host).toBe('proxy.2captcha.com');
      expect(config.port).toBe(8080);
      expect(config.locations).toContain('us-nyc');
      expect(config.costPerGb).toBe(5.0);
      expect(config.enabled).toBe(true);
      expect(config.metadata?.provider).toBe('2captcha');
    });

    it('should include geo-targeting in username', () => {
      const config = provider.getProxyConfig('us-nyc');

      expect(config.username).toContain('test-api-key-12345');
      expect(config.username).toContain('country-us');
      expect(config.username).toContain('city-new_york');
      expect(config.username).toContain('state-new_york');
    });

    it('should generate unique IDs for each proxy config', () => {
      const config1 = provider.getProxyConfig('us-nyc');
      const config2 = provider.getProxyConfig('us-nyc');

      expect(config1.id).not.toBe(config2.id);
      expect(config1.id).toMatch(/^2captcha-us-nyc-/);
    });

    it('should use HTTPS port for https protocol', () => {
      const config = provider.getProxyConfig('us-nyc', { protocol: 'https' });

      expect(config.protocol).toBe('https');
      expect(config.port).toBe(8081);
    });

    it('should use SOCKS5 port for socks5 protocol', () => {
      const config = provider.getProxyConfig('us-nyc', { protocol: 'socks5' });

      expect(config.protocol).toBe('socks5');
      expect(config.port).toBe(1080);
    });

    it('should include session duration in username', () => {
      const config = provider.getProxyConfig('us-nyc', { sessionDuration: 30 });

      expect(config.username).toContain('session-30');
    });

    it('should include session ID for sticky sessions', () => {
      const config = provider.getProxyConfig('us-nyc', { sessionId: 'sticky-123' });

      expect(config.username).toContain('sessid-sticky-123');
    });

    it('should throw for unsupported location', () => {
      expect(() => {
        provider.getProxyConfig('invalid-location' as any);
      }).toThrow("Location 'invalid-location' is not supported by 2Captcha provider");
    });

    it('should override proxy type when specified', () => {
      const config = provider.getProxyConfig('us-nyc', { proxyType: 'datacenter' });

      expect(config.type).toBe('datacenter');
    });
  });

  describe('supportsLocation', () => {
    it('should return true for supported locations', () => {
      expect(provider.supportsLocation('us-nyc')).toBe(true);
      expect(provider.supportsLocation('uk-lon')).toBe(true);
      expect(provider.supportsLocation('jp-tok')).toBe(true);
    });

    it('should return false for unsupported locations', () => {
      expect(provider.supportsLocation('invalid' as any)).toBe(false);
    });
  });

  describe('getAvailableLocations', () => {
    it('should return all supported locations', () => {
      const locations = provider.getAvailableLocations();

      expect(locations).toContain('us-nyc');
      expect(locations).toContain('us-la');
      expect(locations).toContain('uk-lon');
      expect(locations).toContain('de-ber');
      expect(locations).toContain('jp-tok');
      expect(locations.length).toBeGreaterThan(20);
    });

    it('should return a copy of locations array', () => {
      const locations1 = provider.getAvailableLocations();
      const locations2 = provider.getAvailableLocations();

      expect(locations1).not.toBe(locations2);
      expect(locations1).toEqual(locations2);
    });
  });

  describe('validateCredentials', () => {
    it('should return false for empty API key', async () => {
      const emptyKeyProvider = new TwoCaptchaProxyProvider({
        apiKey: '',
      });

      const result = await emptyKeyProvider.validateCredentials();
      expect(result).toBe(false);
    });

    it('should call 2Captcha API to validate', async () => {
      // Mock fetch for the test
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 1, request: '10.50' }),
      });
      global.fetch = mockFetch;

      const result = await provider.validateCredentials();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('2captcha.com/res.php')
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('key=test-api-key-12345')
      );
      expect(result).toBe(true);
    });

    it('should return false on API error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
      });
      global.fetch = mockFetch;

      const result = await provider.validateCredentials();
      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      const result = await provider.validateCredentials();
      expect(result).toBe(false);
    });
  });

  describe('buildProxyUrl', () => {
    it('should build complete proxy URL', () => {
      const url = provider.buildProxyUrl('us-nyc');

      expect(url).toContain('http://');
      expect(url).toContain('proxy.2captcha.com:8080');
      expect(url).toContain('test-api-key-12345');
    });

    it('should URL-encode special characters', () => {
      const specialProvider = new TwoCaptchaProxyProvider({
        apiKey: 'key-with-special@chars',
      });

      const url = specialProvider.buildProxyUrl('us-nyc');
      expect(url).toContain(encodeURIComponent('key-with-special@chars'));
    });
  });
});

describe('Location Mapping', () => {
  describe('TWOCAPTCHA_LOCATION_MAP', () => {
    it('should have mappings for all US locations', () => {
      expect(TWOCAPTCHA_LOCATION_MAP['us-national']).toEqual({ country: 'us' });
      expect(TWOCAPTCHA_LOCATION_MAP['us-nyc']).toEqual({
        country: 'us',
        state: 'new_york',
        city: 'new_york',
      });
      expect(TWOCAPTCHA_LOCATION_MAP['us-la']).toEqual({
        country: 'us',
        state: 'california',
        city: 'los_angeles',
      });
    });

    it('should have mappings for European locations', () => {
      expect(TWOCAPTCHA_LOCATION_MAP['uk-lon']).toEqual({
        country: 'gb',
        city: 'london',
      });
      expect(TWOCAPTCHA_LOCATION_MAP['de-ber']).toEqual({
        country: 'de',
        city: 'berlin',
      });
    });

    it('should have mappings for APAC locations', () => {
      expect(TWOCAPTCHA_LOCATION_MAP['jp-tok']).toEqual({
        country: 'jp',
        city: 'tokyo',
      });
      expect(TWOCAPTCHA_LOCATION_MAP['au-syd']).toEqual({
        country: 'au',
        city: 'sydney',
      });
    });
  });

  describe('getTwoCaptchaGeoTarget', () => {
    it('should return geo target for valid location', () => {
      const target = getTwoCaptchaGeoTarget('us-nyc');

      expect(target).toEqual({
        country: 'us',
        state: 'new_york',
        city: 'new_york',
      });
    });

    it('should return undefined for invalid location', () => {
      const target = getTwoCaptchaGeoTarget('invalid' as any);
      expect(target).toBeUndefined();
    });
  });

  describe('isTwoCaptchaLocationSupported', () => {
    it('should return true for supported locations', () => {
      expect(isTwoCaptchaLocationSupported('us-nyc')).toBe(true);
      expect(isTwoCaptchaLocationSupported('uk-lon')).toBe(true);
    });

    it('should return false for unsupported locations', () => {
      expect(isTwoCaptchaLocationSupported('invalid' as any)).toBe(false);
    });
  });

  describe('getTwoCaptchaSupportedLocations', () => {
    it('should return array of all supported location IDs', () => {
      const locations = getTwoCaptchaSupportedLocations();

      expect(Array.isArray(locations)).toBe(true);
      expect(locations).toContain('us-nyc');
      expect(locations).toContain('uk-lon');
      expect(locations.length).toBe(Object.keys(TWOCAPTCHA_LOCATION_MAP).length);
    });
  });

  describe('buildTwoCaptchaUsername', () => {
    it('should build username with country only', () => {
      const username = buildTwoCaptchaUsername('api-key', { country: 'us' });
      expect(username).toBe('api-key-country-us');
    });

    it('should build username with country and city', () => {
      const username = buildTwoCaptchaUsername('api-key', {
        country: 'gb',
        city: 'london',
      });
      expect(username).toBe('api-key-country-gb-city-london');
    });

    it('should build username with full geo targeting', () => {
      const username = buildTwoCaptchaUsername('api-key', {
        country: 'us',
        state: 'new_york',
        city: 'new_york',
      });
      expect(username).toBe('api-key-country-us-state-new_york-city-new_york');
    });

    it('should include session duration when specified', () => {
      const username = buildTwoCaptchaUsername(
        'api-key',
        { country: 'us' },
        { sessionDuration: 30 }
      );
      expect(username).toBe('api-key-country-us-session-30');
    });

    it('should clamp session duration to valid range', () => {
      const username1 = buildTwoCaptchaUsername(
        'api-key',
        { country: 'us' },
        { sessionDuration: 200 }
      );
      expect(username1).toContain('session-120'); // Max is 120

      const username2 = buildTwoCaptchaUsername(
        'api-key',
        { country: 'us' },
        { sessionDuration: -10 }
      );
      expect(username2).toContain('session-0'); // Min is 0
    });

    it('should include session ID for sticky sessions', () => {
      const username = buildTwoCaptchaUsername(
        'api-key',
        { country: 'us' },
        { sessionId: 'sticky-abc123' }
      );
      expect(username).toBe('api-key-country-us-sessid-sticky-abc123');
    });

    it('should include both session duration and ID', () => {
      const username = buildTwoCaptchaUsername(
        'api-key',
        { country: 'us', city: 'new_york' },
        { sessionDuration: 10, sessionId: 'sess-xyz' }
      );
      expect(username).toBe('api-key-country-us-city-new_york-session-10-sessid-sess-xyz');
    });
  });
});

describe('createTwoCaptchaProvider', () => {
  it('should create provider instance', () => {
    const provider = createTwoCaptchaProvider({
      apiKey: 'test-key',
    });

    expect(provider).toBeInstanceOf(TwoCaptchaProxyProvider);
    expect(provider.name).toBe('2captcha');
  });
});

describe('ProxyManager Integration', () => {
  let manager: ProxyManager;
  let provider: TwoCaptchaProxyProvider;

  beforeEach(() => {
    manager = new ProxyManager();
    provider = new TwoCaptchaProxyProvider({
      apiKey: 'test-api-key',
      priority: 20,
    });
  });

  it('should register 2Captcha provider', () => {
    manager.registerProvider(provider);

    const registered = manager.getProvider('2captcha');
    expect(registered).toBe(provider);
  });

  it('should get proxy from provider', () => {
    manager.registerProvider(provider);

    const proxy = manager.getProxyFromProvider('2captcha', 'us-nyc');

    expect(proxy).toBeDefined();
    expect(proxy!.host).toBe('proxy.2captcha.com');
    expect(proxy!.metadata?.provider).toBe('2captcha');
  });

  it('should add generated proxy to manager', () => {
    manager.registerProvider(provider);

    const proxy = manager.getProxyFromProvider('2captcha', 'us-nyc');
    const retrieved = manager.getProxy(proxy!.id);

    expect(retrieved).toEqual(proxy);
  });

  it('should return undefined for unsupported location', () => {
    manager.registerProvider(provider);

    const proxy = manager.getProxyFromProvider('2captcha', 'invalid-loc');
    expect(proxy).toBeUndefined();
  });

  it('should include provider in registered providers list', () => {
    manager.registerProvider(provider);

    const providers = manager.getRegisteredProviders();

    expect(providers).toContainEqual({
      name: '2captcha',
      priority: 20,
      enabled: true,
    });
  });

  it('should get proxy from any provider supporting location', () => {
    manager.registerProvider(provider);

    const proxy = manager.getProxyFromAnyProvider('us-nyc');

    expect(proxy).toBeDefined();
    expect(proxy!.locations).toContain('us-nyc');
  });

  it('should unregister provider', () => {
    manager.registerProvider(provider);
    expect(manager.getProvider('2captcha')).toBeDefined();

    manager.unregisterProvider('2captcha');
    expect(manager.getProvider('2captcha')).toBeUndefined();
  });

  it('should clear providers when clearing manager', () => {
    manager.registerProvider(provider);
    manager.clear();

    expect(manager.getAllProviders()).toHaveLength(0);
  });
});
