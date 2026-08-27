import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { LocationType } from '../../common/enums/location-type.enum';

@Entity('locations')
export class Location {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ unique: true, length: 100 }) name!: string;
  @Column({ type: 'enum', enum: LocationType, nullable: true }) type!: LocationType | null;
  @Column({ name: 'is_physical', default: true }) isPhysical!: boolean;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}