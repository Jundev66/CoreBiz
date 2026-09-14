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
 * What is gained in exchange: `getUser()` is a network trip to Supabase PER REQUEST, and
 * this API already sits one network hop away from the web. Adding another to every query
 * shows, and shows more on a cold start.
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
        /*
         * The algorithm is declared, not inferred.
         *
         * Without this line the protection already existed, but by accident: `jose` always
         * rejects `alg: none`, and a JWKS only serves asymmetric keys, so a token signed
         * with HS256 using the public key as the secret fails on key import. We were safe
         * because of a library property rather than a decision of ours — and the threat
         * model already claimed "(ES256)" as if the decision had been made.
         *
         * Both asymmetric algorithms Supabase can issue are listed. The local JWKS publishes
         * ES256 (EC P-256), but a project created with RSA keys signs with RS256, and
         * pinning only one would break that deployment with no useful hint. What matters is
         * that the list contains neither `none` nor any HMAC.
         */
        algorithms: ['ES256', 'RS256'],
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
