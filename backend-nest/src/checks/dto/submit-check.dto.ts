import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SubmitCheckDto {
  @IsString()
  url!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxPages?: number;
}