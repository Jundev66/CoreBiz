import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import { loadEnv } from '../config/env';
import type { VerifiedIdentity } from './authenticated-request';

/**
 * Verifica el token de Supabase contra su JWKS.
 *
 * POR QUE NO `supabase.auth.getUser(token)`, que es lo que hace apps/web.
 *
 * Lo que ADR 006 prohibe es `getSession()`, y lo prohibe porque decodifica el token
 * SIN COMPROBAR LA FIRMA: una cookie fabricada a mano pasaria por sesion valida. Eso
 * aqui no ocurre — la firma se verifica criptograficamente contra la clave publica
 * del proyecto, que es exactamente la garantia que la ADR pedia.
 *
 * Lo que se gana a cambio: `getUser()` es un viaje de red a Supabase POR PETICION, y
 * esta API vive en Render, detras de un salto de red que ya existe. Sumar otro a cada
 * consulta se nota, y se nota mas cuando el servicio acaba de despertar.
 *
 * Lo que se paga, dicho sin adornos: la revocacion de CUENTA deja de ser inmediata y
 * pasa a tardar lo que le quede de vida al token. Por eso el TTL del access token
 * baja a 10 minutos en Authentication -> Sessions; no es un ajuste aparte, es parte
 * de esta decision. La revocacion que mas importa en un sistema multi-tenant —echar a
 * alguien de una empresa— sigue siendo inmediata por otra via: el contexto de tenant
 * consulta `listMemberships` en cada peticion, y sin fila no hay acceso.
 */
@Injectable()
export class SupabaseJwtVerifier {
  private readonly issuer: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor() {
    const supabaseUrl = loadEnv().SUPABASE_URL;
    if (supabaseUrl === undefined) {
      throw new Error('Falta SUPABASE_URL. Sin ella no hay contra que verificar los tokens.');
    }
    this.issuer = `${supabaseUrl}/auth/v1`;
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`), {
      cacheMaxAge: 600_000,
      cooldownDuration: 30_000,
      timeoutDuration: 5_000,
    });
  }

  async verify(token: string): Promise<VerifiedIdentity> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: 'authenticated',
        clockTolerance: 5,
      });

      if (typeof payload.sub !== 'string' || payload.sub === '') {
        throw new UnauthorizedException({ errorKind: 'Unauthenticated', errorParams: {} });
      }

      return {
        userId: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : null,
      };
    } catch (cause) {
      if (cause instanceof UnauthorizedException) throw cause;

      /*
       * La misma leccion que ya documenta `verifyUser()` en apps/web: "este token no
       * vale" y "no se ha podido preguntar" son cosas distintas. Un fallo al traer el
       * JWKS devuelto como 401 saca de la aplicacion a quien SI habia entrado, con el
       * formulario de acceso delante y sin ninguna explicacion.
       */
      if (cause instanceof errors.JWKSTimeout || cause instanceof errors.JWKSNoMatchingKey) {
        throw new ServiceUnavailableException({ errorKind: 'AuthUnavailable', errorParams: {} });
      }

      throw new UnauthorizedException({ errorKind: 'Unauthenticated', errorParams: {} });
    }
  }
}
