import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_logs')
@Index(['entity', 'entityId'])
export class AuditLog {
  @PrimaryGeneratedColumn({ type: 'bigint' }) id!: string;
  @Column({ name: 'user_id', type: 'integer', nullable: true }) userId!: number | null;
  @Column({ name: 'user_name', type: 'varchar', length: 200, nullable: true }) userName!: string | null;
  @Column({ length: 50 }) action!: string;
  @Column({ length: 100 }) entity!: string;
  @Column({ name: 'entity_id', type: 'varchar', length: 100, nullable: true }) entityId!: string | null;
  @Column({ name: 'old_values', type: 'jsonb', nullable: true }) oldValues!: Record<string, unknown> | null;
  @Column({ name: 'new_values', type: 'jsonb', nullable: true }) newValues!: Record<string, unknown> | null;
  @Column({ name: 'changed_fields', type: 'simple-array', nullable: true }) changedFields!: string[] | null;
  @Column({ name: 'ip_address', type: 'varchar', length: 50, nullable: true }) ipAddress!: string | null;
  @Column({ name: 'user_agent', type: 'text', nullable: true }) userAgent!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}