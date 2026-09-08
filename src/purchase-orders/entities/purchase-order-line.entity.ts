import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Item } from '../../items/entities/item.entity';
import { PurchaseOrder } from './purchase-order.entity';

@Entity('purchase_order_lines')
@Index('UQ_purchase_order_lines_item', ['purchaseOrder', 'item'], {
  unique: true,
})
export class PurchaseOrderLine {
  @PrimaryGeneratedColumn() id!: number;
  @ManyToOne(() => PurchaseOrder, (order) => order.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'purchase_order_id' })
  purchaseOrder!: PurchaseOrder;
  @ManyToOne(() => Item, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'item_id' })
  item!: Item;
  @Column() qty!: number;
  @Column({ name: 'received_qty', default: 0 }) receivedQty!: number;
  @Column({
    name: 'unit_cost',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  unitCost!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
