import { ApiProperty } from '@nestjs/swagger';

export class TenantSettingsDto {
  @ApiProperty() taxLabel!: string;
  @ApiProperty() taxRateBp!: number;
  @ApiProperty({ enum: ['USD', 'VES'] }) baseCurrency!: 'USD' | 'VES';
  /** Entero escalado, como cadena: un bigint no cabe en un number de JSON. */
  @ApiProperty({ nullable: true, type: String }) exchangeRateScaled!: string | null;
  @ApiProperty({ nullable: true, type: String }) exchangeRateAt!: string | null;
}

export class MembershipDto {
  @ApiProperty() tenantId!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty() role!: string;
  @ApiProperty() planCode!: string;
  @ApiProperty() isDemo!: boolean;
}

export class ActiveTenantDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ nullable: true, type: String }) expiresAt!: string | null;
  @ApiProperty({ type: TenantSettingsDto }) settings!: TenantSettingsDto;
}

export class SessionDto {
  @ApiProperty({ nullable: true, type: String }) email!: string | null;
  @ApiProperty({ type: [MembershipDto] }) memberships!: MembershipDto[];

  /**
   * `null` cuando la cuenta existe pero no pertenece a ninguna empresa. Se responde
   * con 200 y no con un 4xx a proposito: es un estado legitimo por el que pasa todo
   * el mundo una vez, y convertirlo en error obligaria a la interfaz a leer errores
   * para decidir a donde navegar.
   */
  @ApiProperty({ nullable: true, type: ActiveTenantDto }) tenant!: ActiveTenantDto | null;

  @ApiProperty({ nullable: true, type: Object })
  actor!: { userId: string; role: string } | null;

  /**
   * El plan viaja como CODIGO, no como objeto.
   *
   * `Plan` es una clase con comportamiento —`quota()`, `has()`, `checkFeature()`— y
   * eso no cruza HTTP. La interfaz lo reconstruye con `Plan.of(code)`: `@corebiz/domain`
   * es puro y no tiene dependencias, asi que apps/web puede seguir importandolo. Es lo
   * que permite que las 29 paginas sigan preguntando `ctx.plan.quota(...)` sin cambiar
   * una linea.
   */
  @ApiProperty({ nullable: true, type: String }) planCode!: string | null;

  @ApiProperty() memoryDriver!: boolean;
}
