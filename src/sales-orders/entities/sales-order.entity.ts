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
import { Quotation } from '../../quotations/entities/quotation.entity';
import { User } from '../../users/entities/user.entity';
import { SalesOrderStatus } from '../../common/enums/sales-order-status.enum';
import { SalesOrderLine } from './sales-order-line.entity';
import { Reservation } from '../../reservations/entities/reservation.entity';
import { Delivery } from '../../deliveries/entities/delivery.entity';

@Entity('sales_orders')
@Index('IDX_sales_orders_quotation_active', ['quotation'], {
  where: `quotation_id IS NOT NULL AND status != 'Cancelled'`,
})
export class SalesOrder {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'order_no', unique: true, length: 50 }) orderNo!: string;
  @Column({ name: 'order_date', type: 'date', default: () => 'CURRENT_DATE' })
  orderDate!: string;
  @ManyToOne(() => Client, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'client_id' })
  client!: Client | null;
  @Column({ name: 'client_name', type: 'varchar', length: 200, nullable: true })
  clientName!: string | null;
  @Column({
    name: 'contact_person',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  contactPerson!: string | null;
  @Column({ type: 'varchar', length: 50, nullable: true }) phone!:
    string | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) email!:
    string | null;
  @ManyToOne(() => Quotation, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'quotation_id' })
  quotation!: Quotation | null;
  @Column({
    type: 'enum',
    enum: SalesOrderStatus,
    default: SalesOrderStatus.Draft,
  })
  status!: SalesOrderStatus;
  @Column({ name: 'expected_delivery_date', type: 'date', nullable: true })
  expectedDeliveryDate!: string | null;
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
  @Column({ length: 10, default: 'USD' }) currency!: string;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @Column({ type: 'text', nullable: true }) internalNotes!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;
  @OneToMany(() => SalesOrderLine, (line) => line.salesOrder)
  lines!: SalesOrderLine[];
  @OneToMany(() => Reservation, (reservation) => reservation.salesOrder)
  reservations!: Reservation[];
  @OneToMany(() => Delivery, (delivery) => delivery.salesOrder)
  deliveries!: Delivery[];
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
