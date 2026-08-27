import { IsEmail, IsNotEmpty } from 'class-validator';

export class SendQuotationEmailDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}