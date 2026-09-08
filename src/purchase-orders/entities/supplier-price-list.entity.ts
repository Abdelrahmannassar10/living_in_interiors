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
import { User } from '../../users/entities/user.entity';
import { Item } from '../../items/entities/item.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';

@Entity('supplier_price_lists')
@Index(
  'UQ_supplier_price_lists_supplier_item_date',
  ['supplier', 'item', 'effectiveDate'],
  { unique: true },
)
export class SupplierPriceList {
  @PrimaryGeneratedColumn() id!: number;
  @ManyToOne(() => Supplier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'supplier_id' })
  supplier!: Supplier;
  @ManyToOne(() => Item, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item!: Item;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) cost!: string;
  @Column({
    name: 'effective_date',
    type: 'date',
    default: () => 'CURRENT_DATE',
  })
  effectiveDate!: string;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
