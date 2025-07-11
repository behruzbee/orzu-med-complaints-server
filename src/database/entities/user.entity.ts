import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Complaint } from './complaint.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, type: 'bigint' })
  telegramId: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  username: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  lastName: string | null;

  @Column({ default: false })
  isAuthorized: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true })
  complaintStep: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tempBranch: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tempCategory: string | null;

  @Column({ type: 'text', nullable: true })
  complaintTextOrVoiceUrl: string | null;

  @OneToMany(() => Complaint, (complaint) => complaint.user)
  complaints: Complaint[];

  @Column({ name: 'patient_full_name', type: 'varchar', length: 128, nullable: true })
  patientFullName: string | null;

  @Column({ name: 'patient_phone_number', type: 'varchar', length: 20, nullable: true })
  patientPhoneNumber: string | null;
}
