import {
  Controller, Get, Put, Post, Delete, Body, Param, Query, ParseIntPipe,
  UseInterceptors, UploadedFile, BadRequestException, StreamableFile, Res,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger'
import type { Response } from 'express'
import { createReadStream } from 'fs'
import { AtencionesService, UpsertAtencionDto } from './atenciones.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'

@ApiTags('Atenciones')
@ApiBearerAuth()
@Controller('atenciones')
export class AtencionesController {
  constructor(private service: AtencionesService) {}

  @Get('paciente/:pacienteId')
  @ApiOperation({ summary: 'Linea de tiempo clinica del paciente (q busca en los campos)' })
  findByPaciente(
    @CurrentUser() user: JwtPayload,
    @Param('pacienteId', ParseIntPipe) pacienteId: number,
    @Query('q') q?: string,
  ) {
    return this.service.findByPaciente(user.consultorioId, pacienteId, q)
  }

  @Get('cita/:citaId')
  @ApiOperation({ summary: 'Atencion registrada de una cita' })
  findByCita(@CurrentUser() user: JwtPayload, @Param('citaId', ParseIntPipe) citaId: number) {
    return this.service.findByCita(user.consultorioId, citaId)
  }

  @Put('cita/:citaId')
  @ApiOperation({ summary: 'Registrar o actualizar la atencion (ADMIN o el doctor de la cita)' })
  upsert(
    @CurrentUser() user: JwtPayload,
    @Param('citaId', ParseIntPipe) citaId: number,
    @Body() dto: UpsertAtencionDto,
  ) {
    return this.service.upsert(user.consultorioId, citaId, dto, user.sub, user.rol)
  }

  @Post('cita/:citaId/adjuntos')
  @ApiOperation({ summary: 'Subir un adjunto a la atencion (ADMIN o el doctor de la cita)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 5 * 1024 * 1024 } }))
  subirAdjunto(
    @CurrentUser() user: JwtPayload,
    @Param('citaId', ParseIntPipe) citaId: number,
    @UploadedFile() archivo?: Express.Multer.File,
  ) {
    if (!archivo) throw new BadRequestException('Falta el archivo (campo "archivo")')
    return this.service.agregarAdjunto(user.consultorioId, citaId, user.sub, user.rol, archivo)
  }

  @Get('cita/:citaId/adjuntos/:indice')
  @ApiOperation({ summary: 'Descargar/ver un adjunto de la atencion' })
  async verAdjunto(
    @CurrentUser() user: JwtPayload,
    @Param('citaId', ParseIntPipe) citaId: number,
    @Param('indice', ParseIntPipe) indice: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { ruta, meta } = await this.service.obtenerAdjunto(user.consultorioId, citaId, indice)
    res.set({
      'Content-Type': meta.tipo,
      'Content-Disposition': `inline; filename="${encodeURIComponent(meta.nombre)}"`,
    })
    return new StreamableFile(createReadStream(ruta))
  }

  @Delete('cita/:citaId/adjuntos/:indice')
  @ApiOperation({ summary: 'Eliminar un adjunto (ADMIN o el doctor de la cita)' })
  eliminarAdjunto(
    @CurrentUser() user: JwtPayload,
    @Param('citaId', ParseIntPipe) citaId: number,
    @Param('indice', ParseIntPipe) indice: number,
  ) {
    return this.service.eliminarAdjunto(user.consultorioId, citaId, indice, user.sub, user.rol)
  }
}
