import { Migration } from '@mikro-orm/migrations';

export class Migration20250806170157 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table \`audit_trail\` add \`annotated_extractor_document_blob_file_path\` varchar(255) not null;`);
    this.addSql(`alter table \`audit_trail\` change \`annotated_document_blob_file_path\` \`annotated_classifier_document_blob_file_path\` varchar(255) not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table \`audit_trail\` drop column \`annotated_extractor_document_blob_file_path\`;`);

    this.addSql(`alter table \`audit_trail\` change \`annotated_classifier_document_blob_file_path\` \`annotated_document_blob_file_path\` varchar(255) not null;`);
  }

}
