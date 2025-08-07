import { Module } from "@nestjs/common";
import { AuditTrailService } from "./audit.trail.service";
import { AuditTrailRepository } from "./audit.trail.repository";
import { AuditTrail } from "./audit.trail.entity";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { AuditTrailController } from "./audit.trail.controller";

@Module({
    imports: [MikroOrmModule.forFeature([AuditTrail])],
    providers: [AuditTrailService, AuditTrailRepository],
    exports: [AuditTrailService],
    controllers: [AuditTrailController],
})
export class AuditTrailModule {}