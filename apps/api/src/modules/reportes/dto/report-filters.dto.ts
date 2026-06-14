import { Type } from 'class-transformer'
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { EstadoCita } from '@prisma/client'

export class ReportFiltersDto {
  @IsDateString()
  desde!: string

  @IsDateString()
  hasta!: string

  @IsOptional() @Type(() => Number) @IsInt()
  doctorId?: number

  @IsOptional() @Type(() => Number) @IsInt()
  servicioId?: number

  @IsOptional() @Type(() => Number) @IsInt()
  pacienteId?: number

  @IsOptional() @IsEnum(EstadoCita)
  estado?: EstadoCita

  @IsOptional() @Type(() => Number) @IsInt()
  tipoCuentaId?: number

  @IsOptional() @IsString()
  q?: string

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize?: number = 25

  @IsOptional() @IsString()
  sortBy?: string

  @IsOptional() @IsEnum(['asc', 'desc'] as any)
  sortDir?: 'asc' | 'desc' = 'desc'

  // export='1' => el service devuelve TODAS las filas (sin paginar) para Excel.
  @IsOptional() @IsString()
  export?: string
}
