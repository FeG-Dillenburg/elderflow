import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Decoder, Encoder } from 'cbor-x';
import { Public } from '../auth/public.decorator';
import { User } from '../users/user.entity';
import { CreateInitialUserDto, SetupPasswordDto } from './dto/setup.dto';
import { SetupService } from './setup.service';
import { validationExceptionFactory } from '../errors/api-error.filter';

@Controller('api')
@Public()
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get('installation')
  installation() {
    return this.setupService.installation();
  }

  @Post('setup/verify')
  verify(@Body() input: SetupPasswordDto): Promise<{ valid: true }> {
    return this.setupService.verifyPassword(input.setupPassword);
  }

  @Post('setup')
  createInitialUser(@Body() body: Buffer): Promise<User> {
    return this.setupService.createInitialUser(decodeSetupRequest(body));
  }
}

const decoder = new Decoder({ mapsAsObjects: false, useRecords: false });
const encoder = new Encoder({ mapsAsObjects: false, structuredClone: false, tagUint8Array: false, useRecords: false });

function decodeSetupRequest(body: Buffer): CreateInitialUserDto {
  try {
    const value = decoder.decode(body) as unknown;
    if (!Array.isArray(value) || value.length !== 7 || !Array.isArray(value[6]) || value[6].length !== 7) {
      throw new Error('invalid shape');
    }
    if (!Buffer.from(encoder.encode(value)).equals(body)) throw new Error('non-canonical');
    const [defaultLanguage, setupPassword, email, firstName, lastName, password, e2ee] = value;
    const [organizationId, orkId, ockId, sharedPassphraseSlot, recoverySlot, contentKeyWrapper, custodyCopiesAcknowledged] = e2ee;
    for (const envelope of [sharedPassphraseSlot, recoverySlot, contentKeyWrapper]) {
      if (!(envelope instanceof Uint8Array)) throw new Error('invalid envelope');
    }
    const input = plainToInstance(CreateInitialUserDto, {
      defaultLanguage,
      setupPassword,
      email,
      firstName,
      lastName,
      password,
      e2ee: {
        organizationId,
        orkId,
        ockId,
        sharedPassphraseSlot: Buffer.from(sharedPassphraseSlot).toString('base64url'),
        recoverySlot: Buffer.from(recoverySlot).toString('base64url'),
        contentKeyWrapper: Buffer.from(contentKeyWrapper).toString('base64url'),
        custodyCopiesAcknowledged,
      },
    });
    const errors = validateSync(input, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length) throw validationExceptionFactory(errors);
    return input;
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException({ code: 'E2EE_SETUP_PAYLOAD_INVALID', message: 'Invalid binary setup payload' });
  }
}
