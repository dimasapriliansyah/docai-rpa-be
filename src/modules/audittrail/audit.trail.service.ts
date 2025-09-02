import { Injectable } from "@nestjs/common";
import { AuditTrail } from "./audit.trail.entity";
import { EntityManager } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { EntityRepository } from "@mikro-orm/mysql";

@Injectable()
export class AuditTrailService {
    constructor(
        @InjectRepository(AuditTrail)
        private readonly auditTrailRepository: EntityRepository<AuditTrail>,
        private readonly em: EntityManager,
    ) {}

    async createAuditTrail(auditTrail: AuditTrail) {
        await this.em.persistAndFlush(auditTrail);

        return 'ok'
    }

    async getAuditTrailAll() {
        const result = await this.auditTrailRepository.findAll({ orderBy: { createdAt: 'DESC' } });

        return result;
    }

    async getAuditTrailBySessionId(sessionId: string) {
        const result = await this.auditTrailRepository.findAll({ where: { sessionId } });

        return result;
    }
}