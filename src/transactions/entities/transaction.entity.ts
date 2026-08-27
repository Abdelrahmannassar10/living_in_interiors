import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Item } from '../../items/entities/item.entity';
import { Location } from '../../locations/entities/location.entity';
import { AdjustmentType, TransactionType } from '../../common/enums/transaction-type.enum';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'transaction_date', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' }) transactionDate!: Date;
  @ManyToOne(() => Item, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'item_id' }) item!: Item;
  @Column({ name: 'transaction_type', type: 'enum', enum: TransactionType }) transactionType!: TransactionType;
  @Column({ name: 'adjustment_type', type: 'enum', enum: AdjustmentType, nullable: true }) adjustmentType!: AdjustmentType | null;
  @Column({ name: 'adjustment_reason', type: 'varchar', length: 200, nullable: true }) adjustmentReason!: string | null;
  @ManyToOne(() => Location, { nullable: true }) @JoinColumn({ name: 'from_location_id' }) fromLocation!: Location | null;
  @ManyToOne(() => Location, { nullable: true }) @JoinColumn({ name: 'to_location_id' }) toLocation!: Location | null;
  @Column() qty!: number;
  @Column({ name: 'customer_name', type: 'varchar', length: 200, nullable: true }) customerName!: string | null;
  @Column({ name: 'reference_no', type: 'varchar', length: 100, nullable: true }) referenceNo!: string | null;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @Column({ name: 'qty_showroom_before', type: 'integer', nullable: true }) qtyShowroomBefore!: number | null;
  @Column({ name: 'qty_storage1_before', type: 'integer', nullable: true }) qtyStorage1Before!: number | null;
  @Column({ name: 'qty_storage2_before', type: 'integer', nullable: true }) qtyStorage2Before!: number | null;
  @Column({ name: 'qty_sold_before', type: 'integer', nullable: true }) qtySoldBefore!: number | null;
  @Column({ name: 'qty_showroom_after', type: 'integer', nullable: true }) qtyShowroomAfter!: number | null;
  @Column({ name: 'qty_storage1_after', type: 'integer', nullable: true }) qtyStorage1After!: number | null;
  @Column({ name: 'qty_storage2_after', type: 'integer', nullable: true }) qtyStorage2After!: number | null;
  @Column({ name: 'qty_sold_after', type: 'integer', nullable: true }) qtySoldAfter!: number | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'created_by' }) createdBy!: User | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}