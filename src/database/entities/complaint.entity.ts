import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('complaints')
export class Complaint {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.complaints, { onDelete: 'CASCADE' })
  user: User;

  @Column({ type: 'varchar', length: 100 })
  branch: string;

  @Column({ type: 'varchar', length: 100 })
  category: string;

  @Column({ type: 'text', nullable: true })
  text?: string;

  @Column({ type: 'text', nullable: true })
  voiceUrl?: string;

  @Column({ type: 'varchar', length: 20, default: 'поступившие' })
  status: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  patientFullName?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  patientPhoneNumber?: string;

  @CreateDateColumn()
  createdAt: Date;
}
