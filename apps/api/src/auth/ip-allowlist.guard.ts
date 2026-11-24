import {
  Injectable,
  ForbiddenException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { loadEnv } from '../config/env';
import { REQUIRE_IP_ALLOWLIST_KEY } from './require-ip-allowlist.decorator';

export function ipv4ToNumber(ip: string): number {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return -1;
  }
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

export function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed.startsWith('::ffff:')) {
    return trimmed.slice('::ffff:'.length);
  }
  if (trimmed === '::1') {
    return '127.0.0.1';
  }
  return trimmed;
}

export function isIpInCidr(ip: string, cidr: string): boolean {
  const cleanIp = normalizeIp(ip);
  const cleanCidr = cidr.trim();

  if (!cleanCidr.includes('/')) {
    return cleanIp === cleanCidr;
  }

  const [rangeIp, prefixLengthStr] = cleanCidr.split('/');
  if (!rangeIp || !prefixLengthStr) return false;

  const prefixLength = Number(prefixLengthStr);
  if (Number.isNaN(prefixLength) || prefixLength < 0 || prefixLength > 32) return false;

  const ipNum = ipv4ToNumber(cleanIp);
  const rangeNum = ipv4ToNumber(rangeIp);

  if (ipNum === -1 || rangeNum === -1) return false;

  const mask = prefixLength === 0 ? 0 : (~0 << (32 - prefixLength)) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

export function isIpAllowed(ip: string, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return true;
  const normalized = normalizeIp(ip);
  return allowlist.some((entry) => isIpInCidr(normalized, entry));
}

@Injectable()
export class IpAllowlistGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isRequired = this.reflector.getAllAndOverride<boolean>(REQUIRE_IP_ALLOWLIST_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const env = loadEnv();
    const shouldEnforce = env.ENFORCE_IP_ALLOWLIST || isRequired === true;

    if (!shouldEnforce) {
      return true;
    }

    const allowedList = (env.ALLOWED_IP_LIST ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (allowedList.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp =
      typeof forwarded === 'string'
        ? (forwarded.split(',')[0]?.trim() ?? req.ip ?? req.socket?.remoteAddress ?? '')
        : (req.ip ?? req.socket?.remoteAddress ?? '');

    if (!isIpAllowed(clientIp, allowedList)) {
      throw new ForbiddenException({
        errorKind: 'IpAddressForbidden',
        errorParams: { ip: clientIp },
      });
    }

    return true;
  }
}
