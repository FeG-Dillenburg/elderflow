import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { AgendaSectionDto } from './dto/agenda-section.dto';
import { AgendaSection } from './agenda-section.entity';
import { AgendaSectionsService } from './agenda-sections.service';
import { Permission } from '../auth/permissions';

@Controller('api/agenda-sections')
@Permission('contentSettings')
export class AgendaSectionsController {
  constructor(private readonly service: AgendaSectionsService) {}

  @Get()
  findAll(): Promise<AgendaSection[]> { return this.service.findAll(); }

  @Post()
  create(@Body() input: AgendaSectionDto): Promise<AgendaSection> { return this.service.create(input); }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() input: AgendaSectionDto): Promise<AgendaSection> {
    return this.service.update(id, input);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> { return this.service.remove(id); }
}
