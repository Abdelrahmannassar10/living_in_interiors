import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SalesOrder } from '../../sales-orders/entities/sales-order.entity';
import { User } from '../../users/entities/user.entity';
import { DeliveryLine } from './delivery-line.entity';

@Entity('deliveries')
export class Delivery {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'delivery_no', unique: true, length: 50 })
  deliveryNo!: string;
  @ManyToOne(() => SalesOrder, (order) => order.deliveries, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'sales_order_id' })
  salesOrder!: SalesOrder;
  @Column({ name: 'delivered_at', type: 'date', default: () => 'CURRENT_DATE' })
  deliveredAt!: string;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @Column({ name: 'pdf_path', type: 'varchar', length: 500, nullable: true })
  pdfPath!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;
  @OneToMany(() => DeliveryLine, (line) => line.delivery)
  lines!: DeliveryLine[];
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
