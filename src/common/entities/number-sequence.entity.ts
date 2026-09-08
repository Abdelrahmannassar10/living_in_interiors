import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('number_sequences')
export class NumberSequence {
  @PrimaryColumn({ type: 'varchar', length: 100 }) scope!: string;
  @Column({ name: 'next_value' }) nextValue!: number;
}
