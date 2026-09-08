import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../../common/enums/role.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ unique: true, length: 100 }) username!: string;
  @Exclude() @Column({ length: 255 }) password!: string;
  @Column({ name: 'full_name', length: 200 }) fullName!: string;
  @Column({ type: 'enum', enum: Role, default: Role.Staff }) role!: Role;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  @Exclude()
  @Column({
    name: 'refresh_token',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  refreshToken!: string | null;
  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt!: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
