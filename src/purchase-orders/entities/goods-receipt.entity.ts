import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { PurchaseOrder } from './purchase-order.entity';
import { GoodsReceiptLine } from './goods-receipt-line.entity';

@Entity('goods_receipts')
export class GoodsReceipt {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'receipt_no', unique: true, length: 50 }) receiptNo!: string;
  @ManyToOne(() => PurchaseOrder, (order) => order.receipts, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'purchase_order_id' })
  purchaseOrder!: PurchaseOrder;
  @Column({ name: 'received_at', type: 'date', default: () => 'CURRENT_DATE' })
  receivedAt!: string;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;
  @OneToMany(() => GoodsReceiptLine, (line) => line.goodsReceipt)
  lines!: GoodsReceiptLine[];
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
