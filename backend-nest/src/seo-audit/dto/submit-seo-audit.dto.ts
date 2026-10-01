import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SubmitSeoAuditDto {
  @IsString()
  url!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxPages?: number;
}