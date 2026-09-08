import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { User } from '../../users/entities/user.entity';
import { PaymentAllocation } from './payment-allocation.entity';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'payment_no', unique: true, length: 50 }) paymentNo!: string;
  @Index('IDX_payments_client')
  @ManyToOne(() => Client, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'client_id' })
  client!: Client | null;
  /** Client name snapshot. */
  @Column({ name: 'client_name', type: 'varchar', length: 200, nullable: true })
  clientName!: string | null;
  @Column({ name: 'payment_date', type: 'date', default: () => 'CURRENT_DATE' })
  paymentDate!: string;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) amount!: string;
  @Column({ type: 'varchar', length: 50, nullable: true }) method!:
    string | null;
  @Column({
    name: 'reference_no',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  referenceNo!: string | null;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;
  @OneToMany(() => PaymentAllocation, (allocation) => allocation.payment)
  allocations!: PaymentAllocation[];
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
