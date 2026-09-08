import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Item } from './item.entity';
import { Location } from '../../locations/entities/location.entity';

@Entity('item_stocks')
@Unique('UQ_item_stock_item_location', ['item', 'location'])
export class ItemStock {
  @PrimaryGeneratedColumn() id!: number;
  @ManyToOne(() => Item, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'item_id' }) item!: Item;
  @ManyToOne(() => Location, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'location_id' }) location!: Location;
  @Column({ name: 'qty_on_hand', default: 0 }) qtyOnHand!: number;
  @Column({ name: 'qty_reserved', default: 0 }) qtyReserved!: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
