import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Quotation } from './quotation.entity';
import { User } from '../../users/entities/user.entity';

@Entity('quotation_revisions')
export class QuotationRevision {
  @PrimaryGeneratedColumn() id!: number;
  @ManyToOne(() => Quotation, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'quotation_id' }) quotation!: Quotation;
  @Column({ name: 'revision_number' }) revisionNumber!: number;
  @Column({ type: 'jsonb' }) snapshot!: Record<string, unknown>;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'changed_by' }) changedBy!: User | null;
  @CreateDateColumn({ name: 'changed_at' }) changedAt!: Date;
  @Column({ name: 'change_summary', type: 'text', nullable: true }) changeSummary!: string | null;
}