import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { CreateRulesDto } from "./dto/create-rules.dto";
import { InjectRepository } from "@mikro-orm/nestjs";
import { EntityManager, EntityRepository, wrap } from "@mikro-orm/mysql";
import { Rules } from "./repositories/rules.entity";
import { TemplateRules } from "./repositories/template-rules.entity";

@Injectable()
export class RulesService {
    constructor(
        @InjectRepository(Rules)
        private readonly rulesRepository: EntityRepository<Rules>,
        @InjectRepository(TemplateRules)
        private readonly templateRulesRepository: EntityRepository<TemplateRules>,
        private readonly em: EntityManager,
    ) { }

    public async getAllRules() {
        const data = await this.rulesRepository.findAll({
            populate: [
                'rulesTemplateId'
            ]
        });
        return data;
    }

    public async getRules(templateId: string) {
        const data = await this.rulesRepository.findAll({
            where: { rulesTemplateId: templateId }, populate: [
                'rulesTemplateId'
            ]
        });
        return data;
    }

    public async createRules(body: CreateRulesDto) {
        const { rulesTemplateName, ...rules } = body;

        const foundTemplate = await this.templateRulesRepository.findOne({ name: body.rulesTemplateName });

        if (foundTemplate) {
            const rule = this.em.create(Rules, { ...rules, rulesTemplateId: foundTemplate.uuid });
            await this.em.persistAndFlush(rule);
            return { rule: rule }
        } else {
            const template = this.em.create(TemplateRules, { name: rulesTemplateName });
            await this.em.persistAndFlush(template);
            const rule = this.em.create(Rules, { ...rules, rulesTemplateId: template.uuid });
            await this.em.persistAndFlush(rule);
            return { rule: rule }
        }
    }

    public async updateRules(ruleId: string, body: CreateRulesDto) {
        const { rulesTemplateName, ...rules } = body;

        let rulesTemplateId = null as string | null;

        if (rulesTemplateName) {
            const foundTemplate = await this.templateRulesRepository.findOne({ name: rulesTemplateName });
            if (!foundTemplate) {
                throw new HttpException(
                    {
                        message: 'Template rules not existed',
                    },
                    HttpStatus.BAD_REQUEST,
                );
            }
            rulesTemplateId = foundTemplate.uuid;
        }

        const rule = await this.rulesRepository.findOne(ruleId);

        if (!rule) {
            throw new HttpException(
                {
                    message: 'Rule not existed',
                },
                HttpStatus.BAD_REQUEST,
            );
        }

        if (rulesTemplateId) {
            wrap(rule).assign({ ...rules, rulesTemplateId: rulesTemplateId });
        } else {
            wrap(rule).assign({ ...rules });
        }

        await this.em.flush();

        return rule;
    }

    public async deleteRules(ruleId: string) {
        return await this.rulesRepository.nativeDelete({ uuid: ruleId });
    }
} 