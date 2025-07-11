import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Telegraf } from 'telegraf';
import { getBotToken } from 'nestjs-telegraf';
import * as path from "path"
import * as fs from "fs"

async function bootstrap() {
  const uploadPath = path.resolve(__dirname, '..', 'uploads', 'voices');
  fs.mkdirSync(uploadPath, { recursive: true });

  const app = await NestFactory.create(AppModule);
  const bot = app.get<Telegraf>(getBotToken());
  app.use(bot.webhookCallback('/'));

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
