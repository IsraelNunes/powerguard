import { Body, Controller, Post } from '@nestjs/common';
import { WhatIfDto } from './dto/what-if.dto';
import { SimulatorService } from './simulator.service';

@Controller('simulator')
export class SimulatorController {
  constructor(private readonly simulatorService: SimulatorService) {}

  @Post('what-if')
  async whatIf(@Body() body: WhatIfDto) {
    return this.simulatorService.simulate(body);
  }
}
