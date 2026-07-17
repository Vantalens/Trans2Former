/**
 * 第三方依赖声明文件完整性测试
 *
 * 验证 THIRD_PARTY_NOTICES.md 是否包含所有依赖的许可证信息
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testThirdPartyNotices() {
  log('\n========================================', 'blue');
  log('第三方依赖声明文件完整性测试', 'blue');
  log('========================================\n', 'blue');

  let allPassed = true;

  // 1. 检查文件是否存在
  log('1. 检查文件存在性...', 'blue');
  const noticesPath = path.join(rootDir, 'THIRD_PARTY_NOTICES.md');
  if (!fs.existsSync(noticesPath)) {
    log('  ✗ THIRD_PARTY_NOTICES.md 不存在', 'red');
    allPassed = false;
    process.exit(1);
  }
  log('  ✓ THIRD_PARTY_NOTICES.md 存在', 'green');

  // 2. 读取文件内容
  const noticesContent = fs.readFileSync(noticesPath, 'utf-8');

  // 3. 检查必要的依赖是否被提及
  log('\n2. 检查核心依赖声明...', 'blue');

  const requiredDependencies = [
    { name: 'Express', pattern: /Express/i },
    { name: 'Puppeteer', pattern: /Puppeteer/i },
    { name: 'PDF.js', pattern: /PDF\.js/i },
    { name: 'Tesseract.js', pattern: /Tesseract\.js/i },
    { name: 'ONNX Runtime', pattern: /ONNX Runtime/i },
    { name: 'KaTeX', pattern: /KaTeX/i },
    { name: 'PaddleOCR', pattern: /PaddleOCR/i }
  ];

  for (const dep of requiredDependencies) {
    if (dep.pattern.test(noticesContent)) {
      log(`  ✓ ${dep.name} 已声明`, 'green');
    } else {
      log(`  ✗ ${dep.name} 未声明`, 'red');
      allPassed = false;
    }
  }

  // 4. 检查许可证类型是否声明
  log('\n3. 检查许可证类型声明...', 'blue');

  const requiredLicenses = [
    { name: 'MIT License', pattern: /MIT License/i },
    { name: 'Apache License 2.0', pattern: /Apache License 2\.0/i },
    { name: 'ISC License', pattern: /ISC License/i }
  ];

  for (const license of requiredLicenses) {
    if (license.pattern.test(noticesContent)) {
      log(`  ✓ ${license.name} 已声明`, 'green');
    } else {
      log(`  ✗ ${license.name} 未声明`, 'red');
      allPassed = false;
    }
  }

  // 5. 检查版权声明
  log('\n4. 检查版权声明...', 'blue');

  const copyrightPatterns = [
    { name: '通用版权声明', pattern: /Copyright/i },
    { name: 'Mozilla Foundation', pattern: /Mozilla Foundation/i },
    { name: 'Microsoft Corporation', pattern: /Microsoft Corporation/i },
    { name: 'Google Inc', pattern: /Google Inc/i }
  ];

  for (const copyright of copyrightPatterns) {
    if (copyright.pattern.test(noticesContent)) {
      log(`  ✓ ${copyright.name} 已包含`, 'green');
    } else {
      log(`  ✗ ${copyright.name} 未包含`, 'red');
      allPassed = false;
    }
  }

  // 6. 检查仓库链接
  log('\n5. 检查仓库链接...', 'blue');

  const repositoryPatterns = [
    { name: 'GitHub 链接', pattern: /https:\/\/github\.com/i },
    { name: 'Express 仓库', pattern: /github\.com\/expressjs\/express/i },
    { name: 'PDF.js 仓库', pattern: /github\.com\/mozilla\/pdf\.js/i },
    { name: 'ONNX Runtime 仓库', pattern: /github\.com\/microsoft\/onnxruntime/i }
  ];

  for (const repo of repositoryPatterns) {
    if (repo.pattern.test(noticesContent)) {
      log(`  ✓ ${repo.name} 已包含`, 'green');
    } else {
      log(`  ✗ ${repo.name} 未包含`, 'red');
      allPassed = false;
    }
  }

  // 7. 检查 vendor 目录引用
  log('\n6. 检查 vendor 目录引用...', 'blue');

  const vendorPatterns = [
    { name: 'vendor 目录引用', pattern: /public\/vendor/i },
    { name: 'PDF.js vendor 路径', pattern: /public\/vendor\/pdfjs/i },
    { name: 'Tesseract vendor 路径', pattern: /public\/vendor\/tesseract/i },
    { name: 'ONNX vendor 路径', pattern: /public\/vendor\/onnxruntime/i },
    { name: 'PaddleOCR vendor 路径', pattern: /public\/vendor\/paddleocr/i },
    { name: 'KaTeX vendor 路径', pattern: /public\/vendor\/katex/i }
  ];

  for (const vendor of vendorPatterns) {
    if (vendor.pattern.test(noticesContent)) {
      log(`  ✓ ${vendor.name} 已包含`, 'green');
    } else {
      log(`  ✗ ${vendor.name} 未包含`, 'red');
      allPassed = false;
    }
  }

  // 8. 检查文档版本和日期
  log('\n7. 检查文档元信息...', 'blue');

  const metaPatterns = [
    { name: '版本号', pattern: /version.*2\.3\.0/i },
    { name: '更新日期', pattern: /2026-06-23/i },
    { name: 'Trans2Former 项目', pattern: /Trans2Former/i }
  ];

  for (const meta of metaPatterns) {
    if (meta.pattern.test(noticesContent)) {
      log(`  ✓ ${meta.name} 已包含`, 'green');
    } else {
      log(`  ✗ ${meta.name} 未包含`, 'red');
      allPassed = false;
    }
  }

  // 9. 检查文档结构
  log('\n8. 检查文档结构...', 'blue');

  const structurePatterns = [
    { name: '标题', pattern: /^# Third-Party Notices/m },
    { name: 'PDF.js 章节', pattern: /## \d+\. PDF\.js/i },
    { name: 'Tesseract.js 章节', pattern: /## \d+\. Tesseract\.js/i },
    { name: 'ONNX Runtime 章节', pattern: /## \d+\. ONNX Runtime/i },
    { name: 'PaddleOCR 章节', pattern: /## \d+\. PaddleOCR/i },
    { name: 'KaTeX 章节', pattern: /## \d+\. KaTeX/i },
    { name: 'Node.js Dependencies 章节', pattern: /## \d+\. Node\.js Dependencies/i },
    { name: 'License Summaries 章节', pattern: /## \d+\. Summary of Licenses/i },
    { name: 'Acknowledgments 章节', pattern: /## \d+\. Acknowledgments/i }
  ];

  for (const structure of structurePatterns) {
    if (structure.pattern.test(noticesContent)) {
      log(`  ✓ ${structure.name} 已包含`, 'green');
    } else {
      log(`  ✗ ${structure.name} 未包含`, 'red');
      allPassed = false;
    }
  }

  // 10. 检查 README.md 中的引用
  log('\n9. 检查 README.md 引用...', 'blue');

  const readmePath = path.join(rootDir, 'README.md');
  if (!fs.existsSync(readmePath)) {
    log('  ⚠ README.md 不存在', 'yellow');
  } else {
    const readmeContent = fs.readFileSync(readmePath, 'utf-8');
    if (/THIRD_PARTY_NOTICES\.md/i.test(readmeContent)) {
      log('  ✓ README.md 中已引用 THIRD_PARTY_NOTICES.md', 'green');
    } else {
      log('  ✗ README.md 中未引用 THIRD_PARTY_NOTICES.md', 'red');
      allPassed = false;
    }
  }

  // 11. 统计检查
  log('\n10. 统计检查...', 'blue');

  const lines = noticesContent.split('\n').length;
  const sections = (noticesContent.match(/^##/gm) || []).length;
  const links = (noticesContent.match(/https?:\/\//g) || []).length;

  log(`  ℹ 文档总行数: ${lines}`, 'blue');
  log(`  ℹ 章节数量: ${sections}`, 'blue');
  log(`  ℹ 外部链接数: ${links}`, 'blue');

  if (lines < 100) {
    log('  ⚠ 文档内容可能不够完整（少于 100 行）', 'yellow');
  } else {
    log('  ✓ 文档内容充实', 'green');
  }

  // 总结
  log('\n========================================', 'blue');
  if (allPassed) {
    log('✓ 所有测试通过', 'green');
    log('========================================\n', 'blue');
    process.exit(0);
  } else {
    log('✗ 部分测试失败', 'red');
    log('========================================\n', 'blue');
    process.exit(1);
  }
}

// 运行测试
testThirdPartyNotices().catch(err => {
  log(`\n✗ 测试执行出错: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});
