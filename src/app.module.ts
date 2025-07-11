import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegrafModule } from 'nestjs-telegraf';
import { BotModule } from './bot/bot.module';
import { User } from './database/entities/user.entity';
import { Complaint } from './database/entities/complaint.entity';
import { join } from 'path';
import { ServeStaticModule } from '@nestjs/serve-static';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'mysql.railway.internal',
      port: 3306,
      username: 'root',
      password: 'EiUdEtQJBCdZbyCSdWSXXCMGbPeJQjdJ',
      database: 'railway',
      entities: [User, Complaint],
      synchronize: true,
    }),
    TelegrafModule.forRoot({
      token: '7619151064:AAEVptdJNzylzEe6oODm47lszGhro3ptCBw',
    }),
    BotModule,
  ],
})
export class AppModule {}
