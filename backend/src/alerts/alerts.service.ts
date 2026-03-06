import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryAlertsDto } from './dto/query-alerts.dto';

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(query: QueryAlertsDto) {
    const where: Prisma.AlertEventWhereInput = {
      equipmentId: query.equipmentId
    };

    if (query.severity) {
      where.severity = query.severity;
    }

    if (query.from || query.to) {
      where.timestamp = {};
      if (query.from) where.timestamp.gte = new Date(query.from);
      if (query.to) where.timestamp.lte = new Date(query.to);
    }

    const items = await this.prisma.alertEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: query.limit ?? 200
    });

    return {
      equipmentId: query.equipmentId,
      count: items.length,
      items
    };
  }
}
