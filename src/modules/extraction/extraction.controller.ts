import { Body, Controller, Get, Post } from "@nestjs/common";
import { ExtractionService } from "./extraction.service";

@Controller("extraction")
export class ExtractionController {
  constructor(private readonly extractionService: ExtractionService) {}

  @Post("analyze")
  public async extraction(@Body() body: { blobPath: string, modelId: string, containerName: string, useAsTrainingData?: boolean }) {
    return this.extractionService.extraction(body.blobPath, body.modelId, body.containerName, body.useAsTrainingData);
  }

  @Get("models")
  public async listModels() {
    return this.extractionService.listExtractionModels();
  }
}