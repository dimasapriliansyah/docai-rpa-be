import { Migration } from '@mikro-orm/migrations';

export class Migration20250806141029 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table \`audit_trail\` (\`uuid\` varchar(255) not null, \`created_at\` datetime not null, \`updated_at\` datetime not null, \`session_id\` varchar(255) not null, \`module\` enum('classifier', 'extractor', 'verification') not null, \`document_blob_file_path\` varchar(255) not null, \`document_splith_path\` varchar(255) not null, \`annotated_document_blob_file_path\` varchar(255) not null, \`processed_in_seconds\` int not null, primary key (\`uuid\`)) default character set utf8mb4 engine = InnoDB;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists \`audit_trail\`;`);
  }

}
