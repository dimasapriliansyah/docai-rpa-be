import { Migration } from '@mikro-orm/migrations';

export class Migration20250806145211 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table \`audit_trail\` modify \`document_splith_path\` text not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table \`audit_trail\` modify \`document_splith_path\` varchar(255) not null;`);
  }

}
