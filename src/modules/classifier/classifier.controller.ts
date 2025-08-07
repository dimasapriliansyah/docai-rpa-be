import { Body, Controller, Get, Post } from "@nestjs/common";
import { ClassifierService } from "./classifier.service";

@Controller("classifier")
export class ClassifierController {
  constructor(private readonly classifierService: ClassifierService) {}

  @Post("analyze")
  public async classify(@Body() body: { blobPath: string, modelId: string, containerName: string, useAsTrainingData?: boolean }) {
    return this.classifierService.classify(body.blobPath, body.modelId, body.containerName, body.useAsTrainingData);
  }

  @Get("models")
  public async listModels() {
    return this.classifierService.listClassifierModels();
  }
}