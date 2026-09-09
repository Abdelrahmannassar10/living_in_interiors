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
import { SalesOrder } from '../../sales-orders/entities/sales-order.entity';
import { User } from '../../users/entities/user.entity';
import { ReleasePermitStatus } from '../../common/enums/release-permit-status.enum';
import { ReleasePermitLine } from './release-permit-line.entity';

@Entity('release_permits')
export class ReleasePermit {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'permit_no', unique: true, length: 50 }) permitNo!: string;
  @Column({
    name: 'permit_date',
    type: 'date',
    default: () => 'CURRENT_DATE',
  })
  permitDate!: string;
  @ManyToOne(() => SalesOrder, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sales_order_id' })
  salesOrder!: SalesOrder;
  @Column({
    type: 'enum',
    enum: ReleasePermitStatus,
    default: ReleasePermitStatus.Draft,
  })
  status!: ReleasePermitStatus;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @Column({ name: 'internal_notes', type: 'text', nullable: true })
  internalNotes!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by' })
  approvedBy!: User | null;
  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt!: Date | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'released_by' })
  releasedBy!: User | null;
  @Column({ name: 'released_at', type: 'timestamp', nullable: true })
  releasedAt!: Date | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;
  @OneToMany(() => ReleasePermitLine, (line) => line.releasePermit)
  lines!: ReleasePermitLine[];
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
