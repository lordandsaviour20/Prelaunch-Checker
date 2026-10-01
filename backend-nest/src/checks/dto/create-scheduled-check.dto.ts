import { IsIn, IsString } from 'class-validator';

export class CreateScheduledCheckDto {
  @IsString()
  url!: string;

  @IsIn(['daily', 'weekly'])
  intervalType!: 'daily' | 'weekly';
}