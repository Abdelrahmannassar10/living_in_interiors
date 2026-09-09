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
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { Client } from '../../clients/entities/client.entity';
import { User } from '../../users/entities/user.entity';
import { RfqStatus } from '../../common/enums/rfq-status.enum';
import { RfqLine } from './rfq-line.entity';

@Entity('rfqs')
export class Rfq {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'rfq_no', unique: true, length: 50 }) rfqNo!: string;
  @Column({ name: 'rfq_date', type: 'date', default: () => 'CURRENT_DATE' })
  rfqDate!: string;
  @ManyToOne(() => Supplier, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'supplier_id' })
  supplier!: Supplier | null;
  @ManyToOne(() => Client, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'client_id' })
  client!: Client | null;
  @Column({ name: 'client_name', type: 'varchar', length: 200, nullable: true })
  clientName!: string | null;
  @Column({
    name: 'contact_person',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  contactPerson!: string | null;
  @Column({ type: 'varchar', length: 50, nullable: true }) phone!:
    string | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) email!:
    string | null;
  @Column({
    type: 'enum',
    enum: RfqStatus,
    default: RfqStatus.Draft,
  })
  status!: RfqStatus;
  @Column({ name: 'valid_until', type: 'date', nullable: true }) validUntil!:
    string | null;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @Column({ name: 'internal_notes', type: 'text', nullable: true })
  internalNotes!: string | null;
  @Column({ length: 10, default: 'USD' }) currency!: string;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;
  @OneToMany(() => RfqLine, (line) => line.rfq)
  lines!: RfqLine[];
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
