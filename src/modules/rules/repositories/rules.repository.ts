import { EntityRepository } from '@mikro-orm/mysql';
import { Rules } from './rules.entity';

export class RulesRepository extends EntityRepository<Rules> {} 