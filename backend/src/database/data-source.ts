import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run migrations');
}

export default new DataSource({
  type: 'postgres',
  url: databaseUrl,
  entities: [User],
  migrations: [`${__dirname}/migrations/*{.ts,.js}`],
  synchronize: false,
});

