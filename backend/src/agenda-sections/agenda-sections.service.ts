import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgendaSectionDto } from './dto/agenda-section.dto';
import { AgendaSection } from './agenda-section.entity';
import { codedHttpException } from '../errors/coded-http.exception';

const order = { position: 'ASC', id: 'ASC' } as const;
const missing = () => codedHttpException(HttpStatus.NOT_FOUND, 'AGENDA_SECTION_NOT_FOUND', 'Agenda section not found');
const mappingConflict = () => codedHttpException(HttpStatus.CONFLICT, 'AGENDA_SECTION_TYPE_CONFLICT', 'This Topic type already has a default section');

@Injectable()
export class AgendaSectionsService {
  constructor(@InjectRepository(AgendaSection) private readonly sections: Repository<AgendaSection>) {}

  findAll(): Promise<AgendaSection[]> {
    return this.sections.find({ order });
  }

  // Every membership/order change takes the same lock before reading. Row locks
  // alone cannot protect an empty list or prevent a concurrent appended section.
  private async write<T>(work: (repository: Repository<AgendaSection>, sections: AgendaSection[]) => Promise<T>): Promise<T> {
    try {
      return await this.sections.manager.transaction(async (manager) => {
        await manager.query('LOCK TABLE agenda_sections IN SHARE ROW EXCLUSIVE MODE');
        const repository = manager.getRepository(AgendaSection);
        return work(repository, await repository.find({ order }));
      });
    } catch (error) {
      const databaseError = error as { code?: string; constraint?: string };
      if (databaseError.code === '23505' && databaseError.constraint === 'agenda_sections_default_topic_type_unique') {
        throw mappingConflict();
      }
      throw error;
    }
  }

  private assertMapping(sections: AgendaSection[], input: AgendaSectionDto, id?: string): void {
    if (input.defaultTopicType && sections.some((section) => section.id !== id && section.defaultTopicType === input.defaultTopicType)) {
      throw mappingConflict();
    }
  }

  create(input: AgendaSectionDto): Promise<AgendaSection> {
    return this.write(async (repository, sections) => {
      this.assertMapping(sections, input);
      return repository.save(repository.create({
        name: input.name.trim(),
        defaultTopicType: input.defaultTopicType ?? null,
        position: (sections[sections.length - 1]?.position ?? 0) + 1,
      }));
    });
  }

  update(id: string, input: AgendaSectionDto): Promise<AgendaSection> {
    return this.write(async (repository, sections) => {
      const section = sections.find((section) => section.id === id);
      if (!section) throw missing();
      this.assertMapping(sections, input, id);
      section.name = input.name.trim();
      if (input.defaultTopicType !== undefined) section.defaultTopicType = input.defaultTopicType;
      return repository.save(section);
    });
  }

  reorder(ids: string[]): Promise<AgendaSection[]> {
    return this.write(async (repository, sections) => {
      const byId = new Map(sections.map((section) => [section.id, section]));
      if (ids.length !== sections.length || new Set(ids).size !== ids.length || ids.some((id) => !byId.has(id))) {
        throw codedHttpException(HttpStatus.CONFLICT, 'AGENDA_SECTIONS_CHANGED', 'Agenda sections changed; reload before reordering');
      }
      return repository.save(ids.map((id, index) => ({ ...byId.get(id)!, position: index + 1 })));
    });
  }

  remove(id: string): Promise<void> {
    return this.write(async (repository, sections) => {
      if (!sections.some((section) => section.id === id)) throw missing();
      await repository.delete(id);
      await repository.save(sections.filter((section) => section.id !== id).map((section, index) => ({ ...section, position: index + 1 })));
    });
  }
}
