import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Item } from '../../items/entities/item.entity';
import { Location } from '../../locations/entities/location.entity';
import { SalesOrder } from '../../sales-orders/entities/sales-order.entity';

/** A stock reservation: qty of an item at a location, held for a confirmed sales order. */
@Entity('reservations')
@Unique('UQ_reservation_order_item_location', [
  'salesOrder',
  'item',
  'location',
])
export class Reservation {
  @PrimaryGeneratedColumn() id!: number;
  @ManyToOne(() => SalesOrder, (order) => order.reservations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sales_order_id' })
  salesOrder!: SalesOrder;
  @ManyToOne(() => Item, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'item_id' })
  item!: Item;
  @ManyToOne(() => Location, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'location_id' })
  location!: Location;
  @Column() qty!: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
