import { RuleValidasiTipe } from "../repositories/rules.entity";

export class CreateRulesDto {
    dokAcuanJenis: string;
    dokAcuanParameter: string;
    dokPembandingJenis: string;
    dokPembandingParameter: string;
    ruleValidasiTipe: RuleValidasiTipe;
    rulesTemplateName: string;
}