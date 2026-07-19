import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgendaSectionDto } from './dto/agenda-section.dto';
import { AgendaSection } from './agenda-section.entity';
import { codedHttpException } from '../errors/coded-http.exception';

@Injectable()
export class AgendaSectionsService {
  constructor(@InjectRepository(AgendaSection) private readonly sections: Repository<AgendaSection>) {}

  findAll(): Promise<AgendaSection[]> {
    return this.sections.find({ order: { position: 'ASC' } });
  }

  create(input: AgendaSectionDto): Promise<AgendaSection> {
    return this.sections.save(this.sections.create(input));
  }

  async update(id: string, input: AgendaSectionDto): Promise<AgendaSection> {
    const section = await this.sections.findOneBy({ id });
    if (!section) throw codedHttpException(HttpStatus.NOT_FOUND, 'AGENDA_SECTION_NOT_FOUND', 'Agenda section not found');
    return this.sections.save(Object.assign(section, input));
  }

  async remove(id: string): Promise<void> {
    const result = await this.sections.delete(id);
    if (!result.affected) throw codedHttpException(HttpStatus.NOT_FOUND, 'AGENDA_SECTION_NOT_FOUND', 'Agenda section not found');
  }
}
