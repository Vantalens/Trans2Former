#!/usr/bin/env node

/**
 * Corpus Validation Test
 *
 * 验证样例库（samples/corpus）的完整性和可用性：
 * 1. 目录结构完整性
 * 2. 文档索引可读性
 * 3. 程序化生成机制可执行
 * 4. MANIFEST.json 结构正确
 * 5. 样例文件可访问性
 * 6. 格式覆盖矩阵一致性
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 测试计数器
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ ${message}`);
  }
}

console.log('Corpus Validation Test\n');

// Test 1: 验证目录结构
console.log('Test 1: 验证目录结构');
const samplesDir = path.join(projectRoot, 'samples');
const requiredDirs = [
  'corpus',
  'fixtures',
  'md',
  'html',
  'csv',
  'json',
  'xml',
  'txt',
  'png',
  'ocr',
  'ofd'
];

requiredDirs.forEach(dir => {
  const dirPath = path.join(samplesDir, dir);
  assert(fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory(), `目录存在: samples/${dir}`);
});

// Test 2: 验证核心文档存在
console.log('\nTest 2: 验证核心文档存在');
const requiredDocs = [
  'samples/corpus/README.md',
  'samples/fixtures/README.md'
];

requiredDocs.forEach(doc => {
  const docPath = path.join(projectRoot, doc);
  assert(fs.existsSync(docPath), `文档存在: ${doc}`);

  if (fs.existsSync(docPath)) {
    const content = fs.readFileSync(docPath, 'utf-8');
    assert(content.length > 1000, `${doc} 内容充实（> 1000 字符）`);
  }
});

// Test 3: 验证 corpus/README.md 结构
console.log('\nTest 3: 验证 corpus/README.md 结构');
const corpusReadme = path.join(projectRoot, 'samples/corpus/README.md');
if (fs.existsSync(corpusReadme)) {
  const content = fs.readFileSync(corpusReadme, 'utf-8');

  // 检查关键章节
  const requiredSections = [
    '## 1. 概述',
    '## 2. 目录结构',
    '## 3. 分层说明',
    '### 3.1 Basic',
    '### 3.2 Complex',
    '### 3.3 Edge Cases',
    '### 3.4 Real World',
    '### 3.5 Benchmark',
    '## 4. 格式覆盖矩阵',
    '## 5. 程序化生成',
    '## 6. 样例使用指南',
    '## 7. 样例维护规则'
  ];

  requiredSections.forEach(section => {
    assert(content.includes(section), `包含章节: ${section}`);
  });

  // 检查五层分层关键词
  const tiers = ['basic', 'complex', 'edge-cases', 'real-world', 'benchmark'];
  tiers.forEach(tier => {
    assert(content.toLowerCase().includes(tier), `包含分层: ${tier}`);
  });
}

// Test 4: 验证程序化生成脚本
console.log('\nTest 4: 验证程序化生成脚本');
const generateScript = path.join(projectRoot, 'scripts/generate-samples.js');
assert(fs.existsSync(generateScript), '生成脚本存在: scripts/generate-samples.js');

const sampleContentLib = path.join(projectRoot, 'scripts/lib/sample-content.js');
assert(fs.existsSync(sampleContentLib), '内容构建器存在: scripts/lib/sample-content.js');

// Test 5: 验证 package.json 命令
console.log('\nTest 5: 验证 package.json 命令');
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'));
assert(packageJson.scripts['samples:generate'] !== undefined, 'npm 命令配置: samples:generate');

// Test 6: 执行样例生成（small tier 快速验证）
console.log('\nTest 6: 执行样例生成（small tier）');
try {
  // 清理旧的生成结果
  const generatedDir = path.join(samplesDir, 'generated');
  if (fs.existsSync(generatedDir)) {
    fs.rmSync(generatedDir, { recursive: true, force: true });
  }

  // 执行生成
  execSync('node scripts/generate-samples.js --tiers small', {
    cwd: projectRoot,
    stdio: 'pipe',
    timeout: 30000
  });

  assert(true, '样例生成成功执行');

  // 验证生成结果
  const smallDir = path.join(generatedDir, 'small');
  assert(fs.existsSync(smallDir), '生成目录存在: samples/generated/small');

  const manifestPath = path.join(generatedDir, 'MANIFEST.json');
  assert(fs.existsSync(manifestPath), 'MANIFEST.json 已生成');

} catch (error) {
  assert(false, `样例生成失败: ${error.message}`);
}

// Test 7: 验证 MANIFEST.json 结构
console.log('\nTest 7: 验证 MANIFEST.json 结构');
const manifestPath = path.join(samplesDir, 'generated/MANIFEST.json');
if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    assert(manifest.schema === 'trans2former.sample-corpus.v1', 'schema 字段正确');
    assert(manifest.generatedAt !== undefined, 'generatedAt 字段存在');
    assert(Array.isArray(manifest.tiers), 'tiers 字段是数组');
    assert(Array.isArray(manifest.files), 'files 字段是数组');
    assert(Array.isArray(manifest.coverageGaps), 'coverageGaps 字段存在');

    // 验证文件条目结构
    if (manifest.files.length > 0) {
      const firstFile = manifest.files[0];
      assert(firstFile.format !== undefined, '文件条目包含 format');
      assert(firstFile.tier !== undefined, '文件条目包含 tier');
      assert(firstFile.path !== undefined, '文件条目包含 path');
      assert(firstFile.bytes !== undefined, '文件条目包含 bytes');
      assert(firstFile.source !== undefined, '文件条目包含 source');
    }

    // 验证覆盖缺口
    const gapFormats = manifest.coverageGaps.map(g => g.format);
    assert(gapFormats.includes('doc'), 'coverageGaps 包含 doc');
    assert(gapFormats.includes('ofd'), 'coverageGaps 包含 ofd');

  } catch (error) {
    assert(false, `MANIFEST.json 解析失败: ${error.message}`);
  }
}

// Test 8: 验证生成的样例文件
console.log('\nTest 8: 验证生成的样例文件');
const smallDir = path.join(samplesDir, 'generated/small');
if (fs.existsSync(smallDir)) {
  const expectedFormats = ['md', 'html', 'json', 'xml', 'csv', 'txt', 'docx', 'pptx', 'epub', 'pdf', 'xlsx', 'png'];

  expectedFormats.forEach(format => {
    const files = fs.readdirSync(smallDir).filter(f => f.startsWith(`${format}-small.`));
    assert(files.length > 0, `生成了 ${format} 格式样例`);

    if (files.length > 0) {
      const filePath = path.join(smallDir, files[0]);
      const stats = fs.statSync(filePath);
      assert(stats.size > 0, `${format} 样例文件非空（${stats.size} 字节）`);
    }
  });
}

// Test 9: 验证样例库测试脚本
console.log('\nTest 9: 验证样例库测试脚本');
const corpusTest = path.join(projectRoot, 'scripts/sample-corpus-test.js');
assert(fs.existsSync(corpusTest), '样例库测试脚本存在: scripts/sample-corpus-test.js');

// 执行样例库测试
try {
  const output = execSync('node scripts/sample-corpus-test.js', {
    cwd: projectRoot,
    encoding: 'utf-8',
    timeout: 30000
  });
  assert(output.includes('passed'), '样例库测试通过');
} catch (error) {
  assert(false, `样例库测试失败: ${error.message}`);
}

// Test 10: 验证现有样例目录的内容
console.log('\nTest 10: 验证现有样例目录的内容');
const formatDirs = ['md', 'html', 'csv', 'json', 'xml', 'txt', 'png'];

formatDirs.forEach(format => {
  const dirPath = path.join(samplesDir, format);
  if (fs.existsSync(dirPath)) {
    // md 目录特殊处理：包含 .md 文件
    // 其他目录：排除 README.md，但包含实际样例文件
    const files = fs.readdirSync(dirPath).filter(f => {
      if (format === 'md') {
        return f.endsWith('.md') && f !== 'README.md';
      } else {
        return f !== 'README.md';
      }
    });
    assert(files.length > 0, `samples/${format} 目录包含样例文件（${files.length} 个）`);
  }
});

// Test 11: 验证文档中心链接
console.log('\nTest 11: 验证文档中心链接');
const docsReadme = path.join(projectRoot, 'docs/README.md');
if (fs.existsSync(docsReadme)) {
  const content = fs.readFileSync(docsReadme, 'utf-8');
  assert(content.includes('samples/corpus/README.md'), 'docs/README.md 包含 corpus 链接');
  assert(content.includes('samples/fixtures/README.md'), 'docs/README.md 包含 fixtures 链接');
}

// 结果汇总
console.log('\n' + '='.repeat(60));
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log('='.repeat(60));

if (failed > 0) {
  console.error('\n❌ Corpus validation test failed');
  process.exit(1);
} else {
  console.log('\n✅ Corpus validation test passed: all checks completed successfully');
  process.exit(0);
}
