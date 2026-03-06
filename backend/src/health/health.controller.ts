import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getHealth() {
    const startedAt = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - startedAt;

    return {
      status: 'ok',
      service: 'powerguard-api',
      version: process.env.npm_package_version ?? '0.1.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Number(process.uptime().toFixed(2)),
      dependencies: {
        database: {
          status: 'ok',
          latencyMs: dbLatencyMs
        }
      }
    };
  }
}
