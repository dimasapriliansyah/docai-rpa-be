import { Module } from "@nestjs/common";
import { ClassifierModule } from "./modules/classifier/classifier.module";
import { ConfigModule } from "@nestjs/config";
import { AzureStorageModule } from "./modules/azurestorage/azure.storage.module";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import DBConfig from "./mikro-orm.config";
import { ExtractionModule } from "./modules/extraction/extraction.module";

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        MikroOrmModule.forRoot(DBConfig),
        ClassifierModule,
        ExtractionModule,
        AzureStorageModule,
    ],
})
export class AppModule { }