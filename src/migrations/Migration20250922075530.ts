import { Migration } from '@mikro-orm/migrations';

export class Migration20250922075530 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table \`audit_trail\` (\`uuid\` varchar(255) not null, \`created_at\` datetime not null, \`updated_at\` datetime not null, \`session_id\` varchar(255) not null, \`module\` enum('classifier', 'extractor', 'verification') not null, \`document_blob_file_path\` varchar(255) not null, \`document_splith_path\` text not null, \`annotated_classifier_document_blob_file_path\` varchar(255) not null, \`annotated_extractor_document_blob_file_path\` varchar(255) not null, \`extraction_result\` json not null, \`verification_result\` json not null, \`processed_in_seconds\` int not null, \`analyze_document_result\` json not null, primary key (\`uuid\`)) default character set utf8mb4 engine = InnoDB;`);

    this.addSql(`create table \`template_rules\` (\`uuid\` varchar(255) not null, \`created_at\` datetime not null, \`updated_at\` datetime not null, \`name\` varchar(255) not null, primary key (\`uuid\`)) default character set utf8mb4 engine = InnoDB;`);

    this.addSql(`create table \`rules\` (\`uuid\` varchar(255) not null, \`created_at\` datetime not null, \`updated_at\` datetime not null, \`dok_acuan_jenis\` varchar(255) not null, \`dok_acuan_parameter\` varchar(255) not null, \`dok_pembanding_jenis\` varchar(255) not null, \`dok_pembanding_parameter\` varchar(255) not null, \`rule_validasi_tipe\` enum('similarity') not null, \`rules_template_id_uuid\` varchar(255) not null, primary key (\`uuid\`)) default character set utf8mb4 engine = InnoDB;`);
    this.addSql(`alter table \`rules\` add index \`rules_rules_template_id_uuid_index\`(\`rules_template_id_uuid\`);`);

    this.addSql(`alter table \`rules\` add constraint \`rules_rules_template_id_uuid_foreign\` foreign key (\`rules_template_id_uuid\`) references \`template_rules\` (\`uuid\`) on update cascade;`);

    this.addSql(`drop table if exists \`audit_trail_clone\`;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table \`rules\` drop foreign key \`rules_rules_template_id_uuid_foreign\`;`);

    this.addSql(`create table \`audit_trail_clone\` (\`uuid\` varchar(255) not null, \`created_at\` datetime not null, \`updated_at\` datetime not null, \`session_id\` varchar(255) not null, \`module\` enum('classifier', 'extractor', 'verification') not null, \`document_blob_file_path\` varchar(255) not null, \`document_splith_path\` text not null, \`annotated_classifier_document_blob_file_path\` varchar(255) not null, \`processed_in_seconds\` int not null, \`annotated_extractor_document_blob_file_path\` varchar(255) not null, \`extraction_result\` json not null, \`verification_result\` json not null, \`analyze_document_result\` json not null, primary key (\`uuid\`)) default character set utf8mb4 engine = InnoDB;`);

    this.addSql(`drop table if exists \`audit_trail\`;`);

    this.addSql(`drop table if exists \`template_rules\`;`);

    this.addSql(`drop table if exists \`rules\`;`);
  }

}
