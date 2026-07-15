import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgendaSection } from './agenda-section.entity';
import { AgendaSectionsController } from './agenda-sections.controller';
import { AgendaSectionsService } from './agenda-sections.service';

@Module({
  imports: [TypeOrmModule.forFeature([AgendaSection])],
  controllers: [AgendaSectionsController],
  providers: [AgendaSectionsService],
  exports: [AgendaSectionsService],
})
export class AgendaSectionsModule {}
