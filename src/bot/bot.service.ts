import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TelegrafContext } from './bot.context';
import { User } from '../database/entities/user.entity';
import { Repository } from 'typeorm';
import { Markup } from 'telegraf';
import { Complaint } from '../database/entities/complaint.entity';
import { Message } from 'telegraf/typings/core/types/typegram';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { randomUUID } from 'crypto';
import * as ExcelJS from 'exceljs';
import { format } from 'date-fns'; // для форматирования даты

const steps = {
  branch: 'branch',
  category: 'category',
  complaints: 'complaints',
  patientPhoneNumber: 'patient_phone_number',
  patientFullName: 'patient_full_name',
};

@Injectable()
export class BotService {
  private readonly CONFIRMATION_CODE = '2585';

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Complaint)
    private readonly complaintRepo: Repository<Complaint>,
  ) {}

  async handleStart(ctx: TelegrafContext) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    let user = await this.userRepo.findOne({ where: { telegramId } });

    if (user?.isAuthorized) {
      await ctx.reply(
        `👋 Добро пожаловать ${user.firstName}!`,
        this.getMainMenu(),
      );
    } else {
      if (!user) {
        user = this.userRepo.create({
          telegramId,
          username: ctx.from?.username,
          firstName: ctx.from?.first_name,
          lastName: ctx.from?.last_name,
          isAuthorized: false,
        });
        await this.userRepo.save(user);
      }
      await ctx.reply('🔐 Введите код подтверждения для продолжения:');
    }
  }

  async handleText(ctx: TelegrafContext): Promise<void> {
    const telegramId: number | undefined = ctx.from?.id;
    const message = ctx.message as Message.TextMessage | undefined;
    const text: string | undefined = message?.text?.trim();

    if (!telegramId || !text) return;

    const user = await this.userRepo.findOne({ where: { telegramId } });
    if (!user) return;

    if (!user.isAuthorized) {
      if (text === this.CONFIRMATION_CODE) {
        user.isAuthorized = true;
        await this.userRepo.save(user);
        await ctx.reply('✅ Успешно авторизовано!', this.getMainMenu());
      } else {
        await ctx.reply('❌ Неверный код. Попробуйте снова.');
      }
      return;
    }

    if (text === '❌ Отменить') {
      user.complaintStep = null;
      user.tempBranch = null;
      user.tempCategory = null;
      user.complaintTextOrVoiceUrl = null;
      user.patientFullName = null;
      user.patientPhoneNumber = null;
      await this.userRepo.save(user);

      await ctx.reply(
        '🔁 Жалоба отменена. Вы вернулись в главное меню.',
        this.getMainMenu(),
      );
      return;
    }

    switch (user.complaintStep) {
      case steps.branch: {
        user.tempBranch = text;
        user.complaintStep = steps.category;
        await this.userRepo.save(user);
        await ctx.reply(
          'Выберите категорию жалоб:',
          this.withCancelButton(this.getCategoryMenu()),
        );
        return;
      }

      case steps.category: {
        user.tempCategory = text;
        user.complaintStep = steps.complaints;
        await this.userRepo.save(user);
        await ctx.reply(
          'Опишите вашу жалобу 🖊️ или отправьте голосовое сообщение 🗣:',
        );
        return;
      }

      case steps.complaints: {
        // Если пользователь уже отправил голос и сейчас хочет пропустить текст
        if (text === '.') {
          user.complaintStep = steps.patientFullName;
          await this.userRepo.save(user);
          await ctx.reply('Выведите Ф.И.О пациента.');
          return;
        }

        // Если до этого был голос, но теперь текст
        if (user.complaintTextOrVoiceUrl?.startsWith('http')) {
          user.complaintTextOrVoiceUrl += `\nТекст: ${text}`;
        } else {
          user.complaintTextOrVoiceUrl = text;
        }

        user.complaintStep = steps.patientFullName;
        await this.userRepo.save(user);
        await ctx.reply('Выведите Ф.И.О пациента.');
        return;
      }

      case steps.patientFullName: {
        user.patientFullName = text;
        user.complaintStep = steps.patientPhoneNumber;
        await this.userRepo.save(user);
        await ctx.reply(
          '✅ Выведите номер пациента\n<b>ПРИМЕР: +998 99 123 45 67</b>.',
          { parse_mode: 'HTML' },
        );
        return;
      }

      case steps.patientPhoneNumber: {
        user.patientPhoneNumber = text;

        const complaint: Complaint = this.complaintRepo.create({
          // @ts-ignore
          user,
          branch: user.tempBranch || '---',
          category: user.tempCategory || '---',
          text: user.complaintTextOrVoiceUrl?.startsWith('http')
            ? null
            : user.complaintTextOrVoiceUrl || null,
          voiceUrl: user.complaintTextOrVoiceUrl?.startsWith('http')
            ? user.complaintTextOrVoiceUrl
            : null,
          status: 'поступившие',
          patientFullName: user.patientFullName,
          patientPhoneNumber: user.patientPhoneNumber,
        });

        await this.complaintRepo.save(complaint);

        user.complaintStep = null;
        user.tempBranch = null;
        user.tempCategory = null;
        user.complaintTextOrVoiceUrl = null;
        user.patientFullName = null;
        user.patientPhoneNumber = null;

        await this.userRepo.save(user);

        await ctx.reply('✅ Жалоба успешно сохранена!', this.getMainMenu());
        return;
      }

      default: {
        await this.routeMainMenu(ctx, text);
      }
    }
  }

  private async routeMainMenu(ctx: TelegrafContext, text: string) {
    switch (text) {
      case '📋 Просмотр жалоб':
        await this.showComplaintsByStatus(ctx);
        break;
      case '✍️ Подать жалобу':
        await this.askBranch(ctx);
        break;
      default:
        await ctx.reply('⚠️ Пожалуйста, используйте кнопки меню.');
    }
  }

  async showComplaintsByStatus(ctx: TelegrafContext): Promise<void> {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    try {
      const complaints = await this.complaintRepo.find({
        order: { createdAt: 'DESC' },
      });

      if (!complaints.length) {
        await ctx.reply('❌ Жалоб пока нет.');
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Жалобы');

      worksheet.columns = [
        { header: '№', key: 'index', width: 5 },
        { header: 'Филиал', key: 'branch', width: 20 },
        { header: 'Категория', key: 'category', width: 20 },
        { header: 'Жалоба (текст)', key: 'text', width: 40 },
        { header: 'Голос (URL)', key: 'voiceUrl', width: 40 },
        { header: 'Ф.И.О пациента', key: 'patientFullName', width: 25 },
        { header: 'Телефон пациента', key: 'patientPhoneNumber', width: 18 },
        { header: 'Создано', key: 'createdAt', width: 20 },
      ];

      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFDEEAF6' },
        };
      });

      complaints.forEach((complaint, i) => {
        const row = worksheet.addRow({
          index: i + 1,
          branch: complaint.branch,
          category: complaint.category,
          text: complaint.text || '',
          patientFullName: complaint.patientFullName || '',
          patientPhoneNumber: complaint.patientPhoneNumber || '',
          createdAt: format(complaint.createdAt, 'yyyy-MM-dd HH:mm'),
        });

        // Установка гиперссылки для voiceUrl
        if (complaint.voiceUrl) {
          const cell = row.getCell('voiceUrl');
          cell.value = {
            text: '🔊 Аудио',
            hyperlink: complaint.voiceUrl,
          };
          cell.font = { color: { argb: 'FF0000FF' }, underline: true };
        }

        row.eachCell((cell) => {
          cell.alignment = {
            vertical: 'middle',
            horizontal: 'left',
            wrapText: true,
          };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });
      });

      const exportPath = path.resolve(__dirname, '..', '..', 'temp');
      fs.mkdirSync(exportPath, { recursive: true });

      const fileName = `all-complaints-${telegramId}.xlsx`;
      const filePath = path.join(exportPath, fileName);
      await workbook.xlsx.writeFile(filePath);

      await ctx.replyWithDocument({
        source: filePath,
        filename: 'Все_жалобы.xlsx',
      });

      fs.unlinkSync(filePath);
    } catch (error) {
      console.error('Ошибка при экспорте жалоб:', error);
      await ctx.reply('⚠️ Ошибка при экспорте жалоб. Повторите позже.');
    }
  }

  async askBranch(ctx: TelegrafContext) {
    const telegramId = ctx.from?.id;
    const user = await this.userRepo.findOne({ where: { telegramId } });
    if (!user) return;

    user.complaintStep = 'branch';
    await this.userRepo.save(user);

    await ctx.reply(
      'Выберите филиал:',
      this.withCancelButton(this.getBranchMenu()),
    );
  }

  async handleVoiceOrTextComplaint(ctx: TelegrafContext): Promise<void> {
    const telegramId: number | undefined = ctx.from?.id;
    if (!telegramId) return;

    const user = await this.userRepo.findOne({ where: { telegramId } });
    if (!user || !user.isAuthorized) return;

    if (user.complaintStep !== steps.complaints) {
      await ctx.reply(
        '⚠️ Пожалуйста, начните подачу жалобы заново. Вы не на этапе отправки голосового сообщения.',
      );
      return;
    }

    const message = ctx.message as Message.VoiceMessage | undefined;
    const voice = message?.voice;
    if (!voice) return;

    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      await ctx.reply('❌ Ошибка: отсутствует токен бота.');
      return;
    }

    await ctx.reply('⏳ Сохраняем ваше голосовое сообщение на сервер...');

    try {
      // 1. Получить file_path
      const fileInfoRes = await axios.get(
        `https://api.telegram.org/bot${botToken}/getFile?file_id=${voice.file_id}`,
      );

      const filePath = fileInfoRes.data.result.file_path;
      if (!filePath) {
        await ctx.reply('❌ Не удалось получить файл голосового сообщения.');
        return;
      }

      // 2. Сформировать URL и имя файла
      const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
      const filename = `${randomUUID()}.ogg`;
      const uploadDir = path.resolve(
        __dirname,
        '..',
        '..',
        'uploads',
        'voices',
      );
      const fileSavePath = path.join(uploadDir, filename);

      // 3. Убедиться, что директория существует
      fs.mkdirSync(uploadDir, { recursive: true });

      // 4. Скачать файл
      const response = await axios.get(fileUrl, { responseType: 'stream' });
      const writer = fs.createWriteStream(fileSavePath);
      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // 5. Сформировать локальный URL
      const voiceUrl = `https://orzu-med-complaints-server-production.up.railway.app/uploads/voices/${filename}`;

      // 6. Сохранить в user
      user.complaintTextOrVoiceUrl = voiceUrl;
      user.complaintStep = steps.complaints;
      await this.userRepo.save(user);

      await ctx.reply(
        '✅ Голосовое сообщение успешно сохранено. Можете дополнительно ввести текст жалобы (необязательно). Если хотите пропустить, просто отправьте точку (.)',
      );
    } catch (error) {
      console.error('Ошибка при сохранении голосового сообщения:', error);
      await ctx.reply(
        '❌ Произошла ошибка при обработке голосового сообщения. Попробуйте снова.',
      );
    }
  }

  private withCancelButton(markup: ReturnType<typeof Markup.keyboard>) {
    return Markup.keyboard([...markup.reply_markup.keyboard, ['❌ Отменить']])
      .resize()
      .oneTime();
  }

  private getMainMenu() {
    return Markup.keyboard([['📋 Просмотр жалоб'], ['✍️ Подать жалобу']])
      .resize()
      .oneTime();
  }

  private getBranchMenu() {
    return Markup.keyboard([
      ['Зангиота', 'Юнусобод'],
      ['Фотима-Султон', 'Чиноз'],
      ['Янгибозор', 'Паркент'],
      ['Оккурган'],
    ])
      .resize()
      .oneTime();
  }

  private getCategoryMenu() {
    return Markup.keyboard([
      ['Врачлар', 'Хамширалар'],
      ['Тозалик', 'Ошхона ва ошпазлар'],
      ['Регистратура ходимлари', 'Килиника'],
    ])
      .resize()
      .oneTime();
  }
}
