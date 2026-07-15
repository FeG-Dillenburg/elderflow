import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';
import { DashboardData, DashboardService } from './dashboard.service';

@Controller('api/dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}
  @Get() get(@CurrentUser() user: User): Promise<DashboardData> { return this.service.get(user); }
}
