import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { E2eeAuditEvent } from './e2ee-audit-event.entity';
import { E2eeClientEpoch } from './e2ee-client-epoch.entity';
import { E2eeController } from './e2ee.controller';
import { E2eeKeyState } from './e2ee-key-state.entity';
import { E2eeRecoveryCeremony } from './e2ee-recovery-ceremony.entity';
import { E2EE_CLOCK, E2eeService } from './e2ee.service';
import { E2eeScalarService } from './e2ee-scalar.service';
import { E2eeScalarWrite } from './e2ee-scalar-write.entity';

@Module({
  imports: [TypeOrmModule.forFeature([E2eeKeyState, E2eeClientEpoch, E2eeRecoveryCeremony, E2eeAuditEvent, E2eeScalarWrite])],
  controllers: [E2eeController],
  providers: [
    E2eeService,
    E2eeScalarService,
    { provide: E2EE_CLOCK, useValue: { now: () => new Date() } },
  ],
  exports: [E2eeService, E2eeScalarService],
})
export class E2eeModule {}
