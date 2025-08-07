import { Controller, Get, Param } from "@nestjs/common";
import { AuditTrailService } from "./audit.trail.service";

@Controller('audit-trail')
export class AuditTrailController {
    constructor(private readonly auditTrailService: AuditTrailService) { }

    @Get()
    async getAuditTrailAll() {
        return this.auditTrailService.getAuditTrailAll();
    }

    @Get(':sessionId')
    async getAuditTrailBySessionId(@Param('sessionId') sessionId: string) {
        return this.auditTrailService.getAuditTrailBySessionId(sessionId);
    }
}