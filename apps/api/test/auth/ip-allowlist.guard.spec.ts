import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import {
  IpAllowlistGuard,
  ipv4ToNumber,
  normalizeIp,
  isIpInCidr,
  isIpAllowed,
} from '../../src/auth/ip-allowlist.guard';
import { resetEnv } from '../../src/config/env';

describe('IpAllowlistGuard & IP CIDR Matcher', () => {
  beforeEach(() => {
    process.env.DATA_DRIVER = 'memory';
    process.env.ALLOW_MEMORY_DRIVER = 'true';
    resetEnv();
  });

  afterEach(() => {
    delete process.env.DATA_DRIVER;
    delete process.env.ALLOW_MEMORY_DRIVER;
    delete process.env.ALLOWED_IP_LIST;
    delete process.env.ENFORCE_IP_ALLOWLIST;
    resetEnv();
  });
  describe('ipv4ToNumber', () => {
    it('converts valid IPv4 strings to 32-bit unsigned integer', () => {
      expect(ipv4ToNumber('0.0.0.0')).toBe(0);
      expect(ipv4ToNumber('127.0.0.1')).toBe(2130706433);
      expect(ipv4ToNumber('192.168.1.1')).toBe(3232235777);
      expect(ipv4ToNumber('255.255.255.255')).toBe(4294967295);
    });

    it('returns -1 for invalid IP strings', () => {
      expect(ipv4ToNumber('invalid')).toBe(-1);
      expect(ipv4ToNumber('256.0.0.1')).toBe(-1);
      expect(ipv4ToNumber('192.168.1')).toBe(-1);
      expect(ipv4ToNumber('192.168.1.1.1')).toBe(-1);
    });
  });

  describe('normalizeIp', () => {
    it('strips IPv4-mapped IPv6 prefix', () => {
      expect(normalizeIp('::ffff:192.168.1.10')).toBe('192.168.1.10');
      expect(normalizeIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
    });

    it('normalizes IPv6 loopback to 127.0.0.1', () => {
      expect(normalizeIp('::1')).toBe('127.0.0.1');
    });

    it('preserves plain IPv4', () => {
      expect(normalizeIp('10.0.0.5')).toBe('10.0.0.5');
    });
  });

  describe('isIpInCidr', () => {
    it('matches exact single IP without slash', () => {
      expect(isIpInCidr('192.168.1.50', '192.168.1.50')).toBe(true);
      expect(isIpInCidr('192.168.1.51', '192.168.1.50')).toBe(false);
    });

    it('matches /24 subnet correctly', () => {
      const cidr = '192.168.1.0/24';
      expect(isIpInCidr('192.168.1.0', cidr)).toBe(true);
      expect(isIpInCidr('192.168.1.1', cidr)).toBe(true);
      expect(isIpInCidr('192.168.1.254', cidr)).toBe(true);
      expect(isIpInCidr('192.168.2.1', cidr)).toBe(false);
    });

    it('matches /16 and /8 subnets correctly', () => {
      expect(isIpInCidr('172.16.50.2', '172.16.0.0/16')).toBe(true);
      expect(isIpInCidr('172.17.50.2', '172.16.0.0/16')).toBe(false);

      expect(isIpInCidr('10.254.12.1', '10.0.0.0/8')).toBe(true);
      expect(isIpInCidr('11.0.0.1', '10.0.0.0/8')).toBe(false);
    });
  });

  describe('isIpAllowed', () => {
    it('allows everything when allowlist is empty', () => {
      expect(isIpAllowed('203.0.113.195', [])).toBe(true);
    });

    it('matches against a list of allowed CIDRs and IPs', () => {
      const allowlist = ['127.0.0.1', '10.0.0.0/8', '192.168.10.0/24'];
      expect(isIpAllowed('127.0.0.1', allowlist)).toBe(true);
      expect(isIpAllowed('::1', allowlist)).toBe(true);
      expect(isIpAllowed('10.1.2.3', allowlist)).toBe(true);
      expect(isIpAllowed('192.168.10.45', allowlist)).toBe(true);
      expect(isIpAllowed('192.168.11.45', allowlist)).toBe(false);
      expect(isIpAllowed('198.51.100.1', allowlist)).toBe(false);
    });
  });

  describe('IpAllowlistGuard execution', () => {
    function createMockContext(ip: string, xForwardedFor?: string): ExecutionContext {
      const req = {
        ip,
        headers: xForwardedFor ? { 'x-forwarded-for': xForwardedFor } : {},
        socket: { remoteAddress: ip },
      };
      return {
        switchToHttp: () => ({
          getRequest: () => req,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;
    }

    it('allows access when route does not require allowlist and env is disabled', () => {
      const reflector = new Reflector();
      reflector.getAllAndOverride = () => undefined;
      const guard = new IpAllowlistGuard(reflector);

      const ctx = createMockContext('203.0.113.1');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('blocks unauthorized IP when route metadata requires allowlist', () => {
      const reflector = new Reflector();
      reflector.getAllAndOverride = () => true;
      const guard = new IpAllowlistGuard(reflector);

      process.env.ALLOWED_IP_LIST = '127.0.0.1,10.0.0.0/8';
      resetEnv();

      const allowedCtx = createMockContext('10.5.0.1');
      expect(guard.canActivate(allowedCtx)).toBe(true);

      const forbiddenCtx = createMockContext('198.51.100.55');
      expect(() => guard.canActivate(forbiddenCtx)).toThrowError(ForbiddenException);

      delete process.env.ALLOWED_IP_LIST;
      resetEnv();
    });

    it('extracts client IP from X-Forwarded-For header when present', () => {
      const reflector = new Reflector();
      reflector.getAllAndOverride = () => true;
      const guard = new IpAllowlistGuard(reflector);

      process.env.ALLOWED_IP_LIST = '192.168.1.0/24';
      resetEnv();

      const forwardedAllowed = createMockContext('127.0.0.1', '192.168.1.99, 10.0.0.1');
      expect(guard.canActivate(forwardedAllowed)).toBe(true);

      const forwardedBlocked = createMockContext('127.0.0.1', '203.0.113.5, 10.0.0.1');
      expect(() => guard.canActivate(forwardedBlocked)).toThrowError(ForbiddenException);

      delete process.env.ALLOWED_IP_LIST;
      resetEnv();
    });
  });
});
