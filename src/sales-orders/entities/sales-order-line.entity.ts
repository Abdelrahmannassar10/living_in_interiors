import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Item } from '../../items/entities/item.entity';
import { SalesOrder } from './sales-order.entity';

@Entity('sales_order_lines')
export class SalesOrderLine {
  @PrimaryGeneratedColumn() id!: number;
  @ManyToOne(() => SalesOrder, (order) => order.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sales_order_id' })
  salesOrder!: SalesOrder;
  @Column({ name: 'sort_order', default: 0 }) sortOrder!: number;
  @ManyToOne(() => Item, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'item_id' })
  item!: Item | null;
  @Column({
    name: 'code_snapshot',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  codeSnapshot!: string | null;
  @Column({
    name: 'description_snapshot',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  descriptionSnapshot!: string | null;
  @Column({
    name: 'brand_snapshot',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  brandSnapshot!: string | null;
  @Column({ default: 1 }) qty!: number;
  /** Delivered against this line (drives auto-Close and delivery allowance). */
  @Column({ name: 'qty_delivered', default: 0 }) qtyDelivered!: number;
  /** Set when confirmation could not fully reserve the requested quantity. */
  @Column({ default: false }) shortage!: boolean;
  @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 2 })
  unitPrice!: string;
  @Column({ length: 10, default: 'USD' }) currency!: string;
  @Column({
    name: 'discount_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  discountPercent!: string;
  @Column({ name: 'total_price', type: 'decimal', precision: 12, scale: 2 })
  totalPrice!: string;
  @Column({
    name: 'total_price_after_discount',
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  totalPriceAfterDiscount!: string;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
