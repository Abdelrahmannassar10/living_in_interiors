import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { User } from '../../users/entities/user.entity';
import { QuotationStatus } from '../../common/enums/quotation-status.enum';
import { QuotationDetail } from '../../quotation-details/entities/quotation-detail.entity';

@Entity('quotations')
export class Quotation {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'quote_no', unique: true, length: 50 }) quoteNo!: string;
  @Column({ name: 'quote_date', type: 'date', default: () => 'CURRENT_DATE' }) quoteDate!: string;
  @ManyToOne(() => Client, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'client_id' }) client!: Client | null;
  @Column({ name: 'client_name', type: 'varchar', length: 200, nullable: true }) clientName!: string | null;
  @Column({ name: 'project_name', type: 'varchar', length: 200, nullable: true }) projectName!: string | null;
  @Column({ name: 'contact_person', type: 'varchar', length: 200, nullable: true }) contactPerson!: string | null;
  @Column({ type: 'varchar', length: 50, nullable: true }) phone!: string | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) email!: string | null;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @Column({ name: 'internal_notes', type: 'text', nullable: true }) internalNotes!: string | null;
  @Column({ type: 'enum', enum: QuotationStatus, default: QuotationStatus.Draft }) status!: QuotationStatus;
  @Column({ default: 0 }) revision!: number;
  @Column({ name: 'valid_until', type: 'date', nullable: true }) validUntil!: string | null;
  @Column({ name: 'discount_global', type: 'decimal', precision: 5, scale: 2, default: 0 }) discountGlobal!: string;
  @Column({ name: 'vat_percent', type: 'decimal', precision: 5, scale: 2, default: 0 }) vatPercent!: string;
  @Column({ length: 10, default: 'USD' }) currency!: string;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'created_by' }) createdBy!: User | null;
  @OneToMany(() => QuotationDetail, (detail) => detail.quotation) details!: QuotationDetail[];
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}