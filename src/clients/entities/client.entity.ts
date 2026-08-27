import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ length: 200 }) name!: string;
  @Column({ length: 50, default: 'Individual' }) type!: string;
  @Column({ name: 'contact_person', type: 'varchar', length: 200, nullable: true }) contactPerson!: string | null;
  @Column({ type: 'varchar', length: 50, nullable: true }) phone!: string | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) email!: string | null;
  @Column({ type: 'text', nullable: true }) address!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) city!: string | null;
  @Column({ length: 100, default: 'Egypt' }) country!: string;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'created_by' }) createdBy!: User | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}