import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryMeasurementsDto } from './dto/query-measurements.dto';

@Injectable()
export class MeasurementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(query: QueryMeasurementsDto) {
    const where: Prisma.MeasurementWhereInput = {
      equipmentId: query.equipmentId
    };

    if (query.from || query.to) {
      where.timestamp = {};
      if (query.from) {
        where.timestamp.gte = new Date(query.from);
      }
      if (query.to) {
        where.timestamp.lte = new Date(query.to);
      }
    }

    const measurements = await this.prisma.measurement.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      take: query.limit ?? 1000
    });

    return {
      equipmentId: query.equipmentId,
      count: measurements.length,
      items: measurements
    };
  }
}
