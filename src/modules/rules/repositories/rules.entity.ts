import { Entity, EntityRepositoryType, Enum, ManyToOne, Property } from "@mikro-orm/core";
import { BaseEntity } from "../../../base.entity";
import { RulesRepository } from "./rules.repository";
import { TemplateRules } from "./template-rules.entity";

export enum RuleValidasiTipe {
    SIMILARITY = 'similarity'
}

@Entity()
export class Rules extends BaseEntity {
    [EntityRepositoryType]?: RulesRepository;

    @Property()
    dokAcuanJenis: string;

    @Property()
    dokAcuanParameter: string;

    @Property()
    dokPembandingJenis: string;

    @Property()
    dokPembandingParameter: string;

    @Enum(() => RuleValidasiTipe)
    ruleValidasiTipe!: RuleValidasiTipe;

    @ManyToOne()
    rulesTemplateId!: TemplateRules;

    constructor(
        dokAcuanJenis: string,
        dokAcuanParameter: string,
        dokPembandingJenis: string,
        dokPembandingParameter: string,
        ruleValidasiTipe: RuleValidasiTipe,
        rulesTemplateId: TemplateRules,
    ) {
        super();
        this.dokAcuanJenis = dokAcuanJenis;
        this.dokAcuanParameter = dokAcuanParameter;
        this.dokPembandingJenis = dokPembandingJenis;
        this.dokPembandingParameter = dokPembandingParameter;
        this.ruleValidasiTipe = ruleValidasiTipe;
        this.rulesTemplateId = rulesTemplateId;
    }
}