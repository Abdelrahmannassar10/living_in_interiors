import { IsBoolean, IsInt, Min } from 'class-validator';
export class SetAlertConfigDto { @IsInt() @Min(0) threshold!: number; @IsBoolean() isEnabled!: boolean; }