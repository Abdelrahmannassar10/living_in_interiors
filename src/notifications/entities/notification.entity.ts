import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn() id!: number;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;
  @Column({ type: 'varchar', length: 50 }) type!: string;
  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;
  @Column({ name: 'read_at', type: 'timestamp', nullable: true })
  readAt!: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
