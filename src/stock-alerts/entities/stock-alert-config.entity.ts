import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Item } from '../../items/entities/item.entity';

@Entity('stock_alert_configs')
export class StockAlertConfig {
  @PrimaryGeneratedColumn() id!: number;
  @OneToOne(() => Item, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'item_id' }) item!: Item;
  @Column({ default: 1 }) threshold!: number;
  @Column({ name: 'is_enabled', default: true }) isEnabled!: boolean;
  @Column({ name: 'last_alerted_at', type: 'timestamp', nullable: true }) lastAlertedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}