import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/entities/user.entity';
import { BotUpdate } from './bot.update';
import { Complaint } from 'src/database/entities/complaint.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Complaint]),
  ],
  providers: [BotUpdate, BotService],
})
export class BotModule {}
