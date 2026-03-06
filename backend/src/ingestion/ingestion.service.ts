import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadCsvDto } from './dto/upload-csv.dto';
import { parseAndValidateCsv } from './csv.util';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ingestCsv(fileBuffer: Buffer, payload: UploadCsvDto) {
    const csvContent = fileBuffer.toString('utf-8');
    const validation = parseAndValidateCsv(csvContent);

    if (validation.errors.length > 0) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors: validation.errors.slice(0, 30)
      });
    }

    const equipment = await this.resolveEquipment(payload);

    const data = validation.rows.map((row) => ({
      equipmentId: equipment.id,
      timestamp: row.timestamp,
      voltage: row.voltage,
      current: row.current,
      power: row.power,
      frequency: row.frequency,
      temperature: row.temperature,
      phaseA: row.phaseA,
      phaseB: row.phaseB,
      phaseC: row.phaseC
    }));

    const inserted = await this.prisma.measurement.createMany({
      data,
      skipDuplicates: false
    });

    this.logger.log(
      `CSV ingestion completed: equipment=${equipment.id} rows=${validation.rows.length} inserted=${inserted.count}`
    );

    return {
      equipmentId: equipment.id,
      equipmentName: equipment.name,
      rowsReceived: validation.rows.length,
      rowsInserted: inserted.count,
      columnsDetected: validation.columns
    };
  }

  private async resolveEquipment(payload: UploadCsvDto) {
    if (payload.equipmentId) {
      const equipment = await this.prisma.equipment.findUnique({
        where: { id: payload.equipmentId }
      });

      if (!equipment) {
        throw new BadRequestException(`equipmentId not found: ${payload.equipmentId}`);
      }

      return equipment;
    }

    const name = payload.equipmentName ?? `Equipment ${new Date().toISOString()}`;

    return this.prisma.equipment.create({
      data: { name }
    });
  }
}
