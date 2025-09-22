import { Entity, EntityRepositoryType, Property } from "@mikro-orm/core";
import { BaseEntity } from "../../../base.entity";
import { TemplateRulesRepository } from "./template-rules.repository";

@Entity()
export class TemplateRules extends BaseEntity {
    [EntityRepositoryType]?: TemplateRulesRepository;

    @Property()
    name: string;

    constructor(name: string) {
        super();
        this.name = name;
    }
}