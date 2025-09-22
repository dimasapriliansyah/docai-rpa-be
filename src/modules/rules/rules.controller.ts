import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { RulesService } from "./rules.service";
import { CreateRulesDto } from "./dto/create-rules.dto";

@Controller("rules")
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Get()
  public async getAllRules() {
    return this.rulesService.getAllRules();
  }

  @Get(':templateId')
  public async getRules(@Param('templateId') templateId: string) {
    return this.rulesService.getRules(templateId);
  }
  
  @Post()
  public async createRules(@Body() body: CreateRulesDto) {
    return this.rulesService.createRules(body);
  }

  @Patch(':ruleId')
  public async updateRules(@Param('ruleId') ruleId: string, @Body() body: CreateRulesDto) {
    return this.rulesService.updateRules(ruleId, body);
  }

  @Delete(':ruleId')
  public async deleteRules(@Param('ruleId') ruleId: string) {
    return this.rulesService.deleteRules(ruleId);
  }
}