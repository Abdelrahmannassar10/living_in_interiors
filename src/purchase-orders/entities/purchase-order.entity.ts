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
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { User } from '../../users/entities/user.entity';
import { PurchaseOrderStatus } from '../../common/enums/purchase-order-status.enum';
import { PurchaseOrderLine } from './purchase-order-line.entity';
import { GoodsReceipt } from './goods-receipt.entity';

@Entity('purchase_orders')
export class PurchaseOrder {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'purchase_no', unique: true, length: 50 })
  purchaseNo!: string;
  @ManyToOne(() => Supplier, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'supplier_id' })
  supplier!: Supplier | null;
  @Column({ name: 'order_date', type: 'date', default: () => 'CURRENT_DATE' })
  orderDate!: string;
  @Column({ name: 'expected_date', type: 'date', nullable: true })
  expectedDate!: string | null;
  @Column({
    type: 'enum',
    enum: PurchaseOrderStatus,
    default: PurchaseOrderStatus.Draft,
  })
  status!: PurchaseOrderStatus;
  @Column({ length: 10, default: 'USD' }) currency!: string;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;
  @OneToMany(() => PurchaseOrderLine, (line) => line.purchaseOrder)
  lines!: PurchaseOrderLine[];
  @OneToMany(() => GoodsReceipt, (receipt) => receipt.purchaseOrder)
  receipts!: GoodsReceipt[];
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
