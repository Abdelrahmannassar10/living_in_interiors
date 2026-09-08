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
import { Quotation } from '../../quotations/entities/quotation.entity';

@Entity('quotation_details')
export class QuotationDetail {
  @PrimaryGeneratedColumn() id!: number;
  @ManyToOne(() => Quotation, (quotation) => quotation.details, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'quotation_id' })
  quotation!: Quotation;
  @Column({ name: 'sort_order', default: 0 }) sortOrder!: number;
  @ManyToOne(() => Item, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'item_id' })
  item!: Item | null;
  @Column({
    name: 'brand_snapshot',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  brandSnapshot!: string | null;
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
    name: 'dimension_snapshot',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  dimensionSnapshot!: string | null;
  @Column({
    name: 'finish_fabric_snapshot',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  finishFabricSnapshot!: string | null;
  @Column({
    name: 'photo_url_snapshot',
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  photoUrlSnapshot!: string | null;
  @Column({ default: 1 }) qty!: number;
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
  @Column({
    name: 'discount_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  discountAmount!: string;
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
  @Column({ name: 'is_deleted', default: false }) isDeleted!: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
