/**
 * Design Token 完整性测试
 * 验证 CSS 文件中的 Design Token 使用情况
 *
 * Issue #38: Design Token 体系不完整
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 定义应该存在的 Design Token
const expectedTokens = {
  colors: [
    '--bg', '--surface', '--surface-raised', '--surface-soft',
    '--text', '--muted', '--muted-strong',
    '--border', '--border-strong',
    '--accent', '--accent-strong', '--accent-soft', '--accent-warm',
    '--color-success', '--color-success-soft', '--color-success-strong',
    '--color-warning', '--color-warning-soft', '--color-warning-strong',
    '--danger', '--danger-soft', '--danger-strong', '--danger-border',
    '--focus'
  ],
  spacing: [
    '--space-1', '--space-2', '--space-3', '--space-4',
    '--space-5', '--space-6', '--space-7', '--space-8'
  ],
  fontSize: [
    '--text-xs', '--text-sm', '--text-base', '--text-lg',
    '--text-xl', '--text-2xl', '--text-3xl'
  ],
  radius: [
    '--radius', '--radius-sm', '--radius-lg', '--radius-xl', '--radius-full'
  ],
  duration: [
    '--duration-fast', '--duration-base', '--duration-slow'
  ],
  fonts: [
    '--font-ui', '--mono'
  ],
  gradients: [
    '--btn-gradient-primary'
  ]
};

// 定义不应该出现的硬编码模式（排除 token 定义本身）
const hardcodedPatterns = [
  { pattern: /(?<!--[a-z-]+:\s*)rgba\(16,\s*185,\s*129/gi, name: '成功色 rgba(16, 185, 129, ...)' },
  { pattern: /(?<!--[a-z-]+:\s*)rgba\(245,\s*158,\s*11/gi, name: '警告色 rgba(245, 158, 11, ...)' },
  { pattern: /(?<!--[a-z-]+:\s*)rgba\(225,\s*29,\s*72/gi, name: '错误色 rgba(225, 29, 72, ...)' },
  { pattern: /(?<!--[a-z-]+:\s*)#047857(?!\s*;)/gi, name: '成功色 #047857' },
  { pattern: /(?<!--[a-z-]+:\s*)#b45309(?!\s*;)/gi, name: '警告色 #b45309' },
  { pattern: /font-size:\s*(12|13|14|15|17|32)px/gi, name: 'px 字号硬编码' },
  { pattern: /padding:\s*\d+px/gi, name: 'padding px 硬编码' },
  { pattern: /margin:\s*\d+px/gi, name: 'margin px 硬编码' },
  { pattern: /gap:\s*\d+px/gi, name: 'gap px 硬编码' },
  { pattern: /border-radius:\s*(8|10|12|14|16|18|24)px/gi, name: '圆角 px 硬编码' },
  { pattern: /transition:.*?(0\.15|0\.18|0\.6)s/gi, name: '动效时长硬编码' }
];

console.log('🧪 Design Token 完整性测试\n');

let totalErrors = 0;
let totalWarnings = 0;

// 1. 检查 Token 定义是否完整
console.log('📋 检查 Token 定义完整性...');
const stylesPath = path.join(rootDir, 'public', 'styles.css');
const stylesContent = fs.readFileSync(stylesPath, 'utf-8');

const rootBlock = stylesContent.match(/:root\s*\{([^}]+)\}/s);
if (!rootBlock) {
  console.error('❌ 未找到 :root 块');
  totalErrors++;
} else {
  const rootContent = rootBlock[1];

  let missingTokens = [];
  for (const [category, tokens] of Object.entries(expectedTokens)) {
    for (const token of tokens) {
      const regex = new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`, 'i');
      if (!regex.test(rootContent)) {
        missingTokens.push(`${category}: ${token}`);
      }
    }
  }

  if (missingTokens.length > 0) {
    console.error(`❌ 缺失 ${missingTokens.length} 个 Token:`);
    missingTokens.forEach(token => console.error(`   - ${token}`));
    totalErrors += missingTokens.length;
  } else {
    console.log('✅ 所有必需的 Token 都已定义');
  }
}

// 2. 检查 CSS 文件中的硬编码使用
console.log('\n🔍 检查硬编码使用情况...');
const cssFiles = [
  'public/styles/landing.css',
  'public/styles/preview.css'
];

for (const filePath of cssFiles) {
  const fullPath = path.join(rootDir, filePath);
  const fileName = path.basename(filePath);

  if (!fs.existsSync(fullPath)) {
    console.warn(`⚠️  文件不存在: ${filePath}`);
    totalWarnings++;
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  let fileHasIssues = false;

  for (const { pattern, name } of hardcodedPatterns) {
    const matches = [...content.matchAll(pattern)];

    if (matches.length > 0) {
      if (!fileHasIssues) {
        console.log(`\n📄 ${fileName}:`);
        fileHasIssues = true;
      }

      console.log(`   ⚠️  发现 ${matches.length} 处 ${name}`);

      // 显示前 3 个匹配项的上下文
      matches.slice(0, 3).forEach((match, idx) => {
        const lines = content.substring(0, match.index).split('\n');
        const lineNum = lines.length;
        const lineContent = content.split('\n')[lineNum - 1].trim();
        console.log(`      L${lineNum}: ${lineContent.substring(0, 80)}`);
      });

      if (matches.length > 3) {
        console.log(`      ... 还有 ${matches.length - 3} 处`);
      }

      totalWarnings += matches.length;
    }
  }

  if (!fileHasIssues) {
    console.log(`✅ ${fileName}: 无硬编码问题`);
  }
}

// 3. 检查 Token 使用覆盖率
console.log('\n📊 Token 使用统计...');
const allTokens = Object.values(expectedTokens).flat();

for (const filePath of cssFiles) {
  const fullPath = path.join(rootDir, filePath);
  const fileName = path.basename(filePath);

  if (!fs.existsSync(fullPath)) continue;

  const content = fs.readFileSync(fullPath, 'utf-8');
  const usedTokens = new Set();

  for (const token of allTokens) {
    const regex = new RegExp(`var\\(${token.replace(/[.*+?^$()|[\]\\]/g, '\\$&')}`, 'gi');
    if (regex.test(content)) {
      usedTokens.add(token);
    }
  }

  const coverage = ((usedTokens.size / allTokens.length) * 100).toFixed(1);
  console.log(`   ${fileName}: ${usedTokens.size}/${allTokens.length} tokens (${coverage}%)`);
}

// 4. 总结
console.log('\n' + '='.repeat(60));
if (totalErrors === 0 && totalWarnings === 0) {
  console.log('✅ 所有测试通过！Design Token 体系完整且使用正确。');
  process.exit(0);
} else {
  if (totalErrors > 0) {
    console.log(`❌ 发现 ${totalErrors} 个错误`);
  }
  if (totalWarnings > 0) {
    console.log(`⚠️  发现 ${totalWarnings} 个警告（建议优化的硬编码）`);
  }
  console.log('\n💡 建议: 将硬编码值替换为对应的 Design Token');
  process.exit(totalErrors > 0 ? 1 : 0);
}
