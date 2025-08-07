import { EntityRepository } from '@mikro-orm/mysql';
import { AuditTrail } from './audit.trail.entity';

export class AuditTrailRepository extends EntityRepository<AuditTrail> {} 