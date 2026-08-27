import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('brands')
export class Brand {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ unique: true, length: 200 }) name!: string;
  @Column({ type: 'varchar', nullable: true, length: 100 }) country!: string | null;
  @Column({ name: 'logo_url', type: 'varchar', nullable: true, length: 500 }) logoUrl!: string | null;
  @Column({ type: 'varchar', nullable: true, length: 300 }) website!: string | null;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' }) createdBy!: User | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}