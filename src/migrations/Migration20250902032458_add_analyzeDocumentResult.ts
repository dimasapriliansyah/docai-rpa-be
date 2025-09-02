import { Migration } from '@mikro-orm/migrations';

export class Migration20250902032458_add_analyzeDocumentResult extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table \`audit_trail\` add \`analyze_document_result\` json not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table \`audit_trail\` drop column \`analyze_document_result\`;`);
  }

}
