import { Module } from "@nestjs/common";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Rules } from "./repositories/rules.entity";
import { TemplateRules } from "./repositories/template-rules.entity";
import { RulesService } from "./rules.service";
import { RulesController } from "./rules.controller";

@Module({
    imports: [MikroOrmModule.forFeature([Rules, TemplateRules])],
    exports: [RulesService],
    providers: [RulesService],
    controllers: [RulesController],
})
export class RulesModule {}