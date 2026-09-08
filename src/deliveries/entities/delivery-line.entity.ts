import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Item } from '../../items/entities/item.entity';
import { Delivery } from './delivery.entity';

@Entity('delivery_lines')
export class DeliveryLine {
  @PrimaryGeneratedColumn() id!: number;
  @ManyToOne(() => Delivery, (delivery) => delivery.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'delivery_id' })
  delivery!: Delivery;
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
  /** Sales-order line this delivery fulfills against. Nullable → manual/packline item. */
  @Column({ name: 'sales_order_line_id', type: 'integer', nullable: true })
  salesOrderLineId!: number | null;
  @Column() qty!: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
