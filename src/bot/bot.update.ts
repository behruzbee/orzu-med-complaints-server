import { Ctx, Start, Update, On } from 'nestjs-telegraf';
import { TelegrafContext } from './bot.context';
import { BotService } from './bot.service';

@Update()
export class BotUpdate {
  constructor(private readonly botService: BotService) {}

  @Start()
  async start(@Ctx() ctx: TelegrafContext) {
    await this.botService.handleStart(ctx);
  }

  @On('text')
  async onText(@Ctx() ctx: TelegrafContext) {
    await this.botService.handleText(ctx);
  }

  @On('voice')
  async onVoice(@Ctx() ctx: TelegrafContext) {
    await this.botService.handleVoiceOrTextComplaint(ctx);
  }
}
