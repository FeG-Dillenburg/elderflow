import { Controller, Get, Header } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';
import { DashboardData, DashboardService } from './dashboard.service';
import { Permission } from '../auth/permissions';

@Controller('api/dashboard')
@Permission('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  get(@CurrentUser() user: User): Promise<DashboardData> { return this.service.get(user); }
}
