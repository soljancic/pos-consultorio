import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator'

export class SolicitarPasswordDto {
  @IsEmail()
  email: string
}

export class EstablecerPasswordDto {
  // 64 hex chars (randomBytes(32)); el formato corta basura antes de tocar la DB
  @IsString() @Matches(/^[a-f0-9]{64}$/, { message: 'token invalido' })
  token: string

  @IsString() @MinLength(8) @MaxLength(72)
  password: string
}
