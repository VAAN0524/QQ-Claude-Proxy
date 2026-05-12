#!/usr/bin/env node
import initSqlJs from 'sql.js';
import * as fs from 'fs';

const dbPath = `${process.env.HOME || process.env.USERPROFILE}/.claude/data/knowledge/knowledge.db`;

async function checkDb() {
  console.log(`检查数据库: ${dbPath}\n`);

  const buffer = fs.readFileSync(dbPath);
  const SQL = await initSqlJs();
  const db = new SQL.Database(buffer);

  // 查看所有表
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('📋 数据库表:');
  tables[0]?.values.forEach(row => console.log(`  - ${row[0]}`));

  // 查看 knowledge_items 表结构
  console.log('\n📋 knowledge_items 表结构:');
  const schema = db.exec("PRAGMA table_info(knowledge_items)");
  schema[0]?.values.forEach(col => {
    console.log(`  - ${col[1]}: ${col[2]}`);
  });

  // 查询数据
  console.log('\n📊 知识条目数:');
  const count = db.exec("SELECT COUNT(*) as count FROM knowledge_items");
  console.log(`  总数: ${count[0]?.values[0][0]}`);

  // 列出所有数据
  console.log('\n📚 所有知识:');
  const items = db.exec("SELECT id, content_type, content, level1_tag, level2_tag, level3_tag FROM knowledge_items LIMIT 20");
  
  if (items[0]) {
    items[0].values.forEach((row, i) => {
      console.log(`\n${i + 1}. [${row[1]}] ${row[2].substring(0, 60)}...`);
      console.log(`   标签: ${row[3]}/${row[4]}/${row[5]}`);
      console.log(`   ID: ${row[0]}`);
    });
  } else {
    console.log('  (空)');
  }

  db.close();
}

checkDb().catch(console.error);
