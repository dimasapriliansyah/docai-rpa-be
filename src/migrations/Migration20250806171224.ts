import { Migration } from '@mikro-orm/migrations';

export class Migration20250806171224 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table \`audit_trail\` add \`extraction_result\` json not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table \`audit_trail\` drop column \`extraction_result\`;`);
  }

}
