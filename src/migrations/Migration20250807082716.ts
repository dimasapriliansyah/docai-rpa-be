import { Migration } from '@mikro-orm/migrations';

export class Migration20250807082716 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table \`audit_trail\` add \`verification_result\` json not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table \`audit_trail\` drop column \`verification_result\`;`);
  }

}
