import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { SalesOrder } from '../../sales-orders/entities/sales-order.entity';
import { User } from '../../users/entities/user.entity';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import { InvoiceLine } from './invoice-line.entity';

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'invoice_no', unique: true, length: 50 }) invoiceNo!: string;
  @Index('IDX_invoices_client')
  @ManyToOne(() => Client, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'client_id' })
  client!: Client | null;
  /** Client name snapshot (legal-document freeze). */
  @Column({ name: 'client_name', type: 'varchar', length: 200, nullable: true })
  clientName!: string | null;
  @Index('IDX_invoices_sales_order')
  @ManyToOne(() => SalesOrder, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sales_order_id' })
  salesOrder!: SalesOrder | null;
  @Column({ name: 'invoice_date', type: 'date', default: () => 'CURRENT_DATE' })
  invoiceDate!: string;
  @Column({
    type: 'enum',
    enum: InvoiceStatus,
    default: InvoiceStatus.Open,
  })
  status!: InvoiceStatus;
  @Column({ length: 10, default: 'USD' }) currency!: string;
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  subtotal!: string;
  @Column({
    name: 'discount_global',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  discountGlobal!: string;
  @Column({
    name: 'vat_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  vatPercent!: string;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) total!: string;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;
  @OneToMany(() => InvoiceLine, (line) => line.invoice)
  lines!: InvoiceLine[];
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
