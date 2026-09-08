import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Invoice } from './invoice.entity';
import { Payment } from './payment.entity';

@Entity('payment_allocations')
export class PaymentAllocation {
  @PrimaryGeneratedColumn() id!: number;
  @Index('IDX_payment_allocations_payment')
  @ManyToOne(() => Payment, (payment) => payment.allocations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'payment_id' })
  payment!: Payment;
  @Index('IDX_payment_allocations_invoice')
  @ManyToOne(() => Invoice, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'invoice_id' })
  invoice!: Invoice;
  /** How much of this payment was applied to the invoice. */
  @Column({ type: 'decimal', precision: 12, scale: 2 }) amount!: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
