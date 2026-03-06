import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SimulateDataDto } from './dto/simulate-data.dto';
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

  async generateSimulatedDataset(payload: SimulateDataDto) {
    const days = payload.days ?? 14;
    const intervalMinutes = payload.intervalMinutes ?? 5;
    const points = Math.floor((days * 24 * 60) / intervalMinutes);

    const equipment = await this.prisma.equipment.create({
      data: { name: payload.equipmentName ?? `Demo Asset ${new Date().toISOString()}` }
    });

    const start = Date.now() - days * 24 * 60 * 60 * 1000;
    const rows = Array.from({ length: points }).map((_, idx) => {
      const ts = new Date(start + idx * intervalMinutes * 60 * 1000);
      const dayCycle = Math.sin((2 * Math.PI * (idx % Math.floor((24 * 60) / intervalMinutes))) / Math.floor((24 * 60) / intervalMinutes));
      const noise = Math.sin((2 * Math.PI * idx) / 40);

      let voltage = 220 + dayCycle * 3 + noise * 0.8;
      let current = 90 + dayCycle * 12 + Math.cos((2 * Math.PI * idx) / 32) * 4;
      let frequency = 60 + Math.sin((2 * Math.PI * idx) / 180) * 0.02;
      let temperature = 43 + dayCycle * 4.2 + Math.sin((2 * Math.PI * idx) / 70) * 1.4;

      if (idx > points * 0.72 && idx < points * 0.76) {
        current += 34;
        temperature += 12;
        voltage -= 7;
      }

      if (idx > points * 0.88 && idx < points * 0.89) {
        frequency = 59.55;
      }

      const power = voltage * current;

      return {
        equipmentId: equipment.id,
        timestamp: ts,
        voltage,
        current,
        power,
        frequency,
        temperature,
        phaseA: current * 0.99,
        phaseB: current,
        phaseC: current * 1.01
      };
    });

    const inserted = await this.prisma.measurement.createMany({
      data: rows
    });

    this.logger.log(
      `Simulated dataset generated: equipment=${equipment.id}, days=${days}, points=${inserted.count}`
    );

    return {
      equipmentId: equipment.id,
      equipmentName: equipment.name,
      rowsInserted: inserted.count,
      intervalMinutes,
      days
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
