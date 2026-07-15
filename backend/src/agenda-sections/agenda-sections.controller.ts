import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { AgendaSectionDto } from './dto/agenda-section.dto';
import { AgendaSection } from './agenda-section.entity';
import { AgendaSectionsService } from './agenda-sections.service';
import { Roles } from '../auth/roles.decorator';

@Controller('api/agenda-sections')
export class AgendaSectionsController {
  constructor(private readonly service: AgendaSectionsService) {}

  @Get()
  findAll(): Promise<AgendaSection[]> { return this.service.findAll(); }

  @Post()
  @Roles('admin')
  create(@Body() input: AgendaSectionDto): Promise<AgendaSection> { return this.service.create(input); }

  @Put(':id')
  @Roles('admin')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() input: AgendaSectionDto): Promise<AgendaSection> {
    return this.service.update(id, input);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> { return this.service.remove(id); }
}
