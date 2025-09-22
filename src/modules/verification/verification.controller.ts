import { Body, Controller, Post } from "@nestjs/common";
import { VerificationService } from "./verification.service";

@Controller('verification')
export class VerificationController {
    constructor(private readonly verificationService: VerificationService) {}

    @Post('analyze')
    public async analyze(@Body() body: { blobPath: string, containerName: string, classifierModelId: string, rules?: any[], rulesTemplateId?: string }) {
        return this.verificationService.analyze(body);
    }
}