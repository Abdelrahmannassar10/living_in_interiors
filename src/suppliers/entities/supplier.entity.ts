import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Brand } from '../../brands/entities/brand.entity';
import { User } from '../../users/entities/user.entity';

@Entity('suppliers')
export class Supplier {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ length: 200 }) name!: string;
  @ManyToOne(() => Brand, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'brand_id' }) brand!: Brand | null;
  @Column({ name: 'contact_person', type: 'varchar', length: 200, nullable: true }) contactPerson!: string | null;
  @Column({ type: 'varchar', length: 50, nullable: true }) phone!: string | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) email!: string | null;
  @Column({ type: 'varchar', length: 300, nullable: true }) website!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) country!: string | null;
  @Column({ name: 'payment_terms', type: 'varchar', length: 200, nullable: true }) paymentTerms!: string | null;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'created_by' }) createdBy!: User | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}