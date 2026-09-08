import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Item } from '../../items/entities/item.entity';
import { Location } from '../../locations/entities/location.entity';
import { AdjustmentReason, AdjustmentType, TransactionType } from '../../common/enums/transaction-type.enum';
import { StockSnapshot } from '../stock-engine';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'transaction_date', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' }) transactionDate!: Date;
  @ManyToOne(() => Item, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'item_id' }) item!: Item;
  @Column({ name: 'transaction_type', type: 'enum', enum: TransactionType }) transactionType!: TransactionType;
  @Column({ name: 'adjustment_type', type: 'enum', enum: AdjustmentType, nullable: true }) adjustmentType!: AdjustmentType | null;
  @Column({ name: 'adjustment_reason', type: 'enum', enum: AdjustmentReason, nullable: true }) adjustmentReason!: AdjustmentReason | null;
  @ManyToOne(() => Location, { nullable: true }) @JoinColumn({ name: 'from_location_id' }) fromLocation!: Location | null;
  @ManyToOne(() => Location, { nullable: true }) @JoinColumn({ name: 'to_location_id' }) toLocation!: Location | null;
  @Column() qty!: number;
  @Column({ name: 'customer_name', type: 'varchar', length: 200, nullable: true }) customerName!: string | null;
  @Column({ name: 'reference_no', type: 'varchar', length: 100, nullable: true }) referenceNo!: string | null;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  /** { "<locationId>": { onHand, reserved } } for the locations touched by this move */
  @Column({ name: 'stock_before', type: 'jsonb', nullable: true }) stockBefore!: StockSnapshot | null;
  @Column({ name: 'stock_after', type: 'jsonb', nullable: true }) stockAfter!: StockSnapshot | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'created_by' }) createdBy!: User | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
