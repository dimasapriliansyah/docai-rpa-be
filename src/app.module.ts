import { Module } from "@nestjs/common";
import { ClassifierModule } from "./modules/classifier/classifier.module";
import { ConfigModule } from "@nestjs/config";
import { AzureStorageModule } from "./modules/azurestorage/azure.storage.module";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import DBConfig from "./mikro-orm.config";
import { ExtractionModule } from "./modules/extraction/extraction.module";
import { VerificationModule } from "./modules/verification/verification.module";
import { RulesModule } from "./modules/rules/rules.module";

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        MikroOrmModule.forRoot(DBConfig),
        AzureStorageModule,
        ClassifierModule,
        ExtractionModule,
        VerificationModule,
        RulesModule,
    ],
})
export class AppModule { }