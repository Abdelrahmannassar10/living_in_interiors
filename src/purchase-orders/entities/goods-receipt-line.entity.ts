import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Item } from '../../items/entities/item.entity';
import { GoodsReceipt } from './goods-receipt.entity';

@Entity('goods_receipt_lines')
export class GoodsReceiptLine {
  @PrimaryGeneratedColumn() id!: number;
  @ManyToOne(() => GoodsReceipt, (receipt) => receipt.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'goods_receipt_id' })
  goodsReceipt!: GoodsReceipt;
  @ManyToOne(() => Item, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'item_id' })
  item!: Item;
  @Column() qty!: number;
  @Column({ name: 'unit_cost', type: 'decimal', precision: 12, scale: 2 })
  unitCost!: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
