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
   * No authentication on purpose: the web's health route and an external monitor query it,
   * and neither has a session. What it returns says NOTHING about the inside — no version,
   * no connection string, no Postgres error — because an open endpoint that describes the
   * infrastructure is free reconnaissance.
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
