import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService, type HealthReport } from './health.service';

@ApiTags('operacion')
@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  /**
   * No lleva autenticacion a proposito: lo consultan Render y un monitor externo,
   * y ninguno de los dos tiene sesion. Lo que devuelve no dice NADA del interior
   * —ni version, ni cadena de conexion, ni el error de Postgres— porque un
   * endpoint abierto que describe la infraestructura es reconocimiento gratis.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Estado del servicio y de su base de datos' })
  async get(): Promise<HealthReport> {
    const report = await this.health.check();
    if (report.status !== 'ok') throw new ServiceUnavailableException(report);
    return report;
  }
}
