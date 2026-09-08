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
import { Brand } from '../../brands/entities/brand.entity';
import { User } from '../../users/entities/user.entity';
import { ItemPhoto } from './item-photo.entity';

@Entity('items')
export class Item {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ unique: true, length: 100 }) code!: string;
  @ManyToOne(() => Brand, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'brand_id' })
  brand!: Brand | null;
  @Column({ type: 'varchar', nullable: true, length: 500 }) description!:
    string | null;
  @Column({ type: 'varchar', nullable: true, length: 200 }) dimension!:
    string | null;
  @Column({
    name: 'finish_fabric',
    type: 'varchar',
    nullable: true,
    length: 200,
  })
  finishFabric!: string | null;
  @Column({ type: 'varchar', nullable: true, length: 100 }) category!:
    string | null;
  @Column({
    name: 'sub_category',
    type: 'varchar',
    nullable: true,
    length: 100,
  })
  subCategory!: string | null;
  /** Denormalized lifetime counter of units sold; the source of truth for stock is item_stocks. */
  @Column({ name: 'qty_sold', default: 0 }) qtySold!: number;
  @Column({ name: 'initial_qty', default: 0 }) initialQty!: number;
  @Column({
    name: 'unit_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  unitPrice!: string | null;
  @Column({ length: 10, default: 'USD' }) currency!: string;
  @Column({ name: 'low_stock_threshold', default: 1 })
  lowStockThreshold!: number;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;
  @OneToMany(() => ItemPhoto, (photo) => photo.item) photos!: ItemPhoto[];
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
