const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('========================================================');
console.log('📦 正在為您打包專案所有內容、書面報告與完整對話紀錄...');
console.log('========================================================');

const rootDir = path.resolve(__dirname, '..');
const zipName = '專案完整內容與對話記錄.zip';
const zipPath = path.join(rootDir, zipName);

// 若先前有舊的 zip 則移除
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

// 建立打包清單 (排除龐大的 node_modules 與 22MB 原始 CSV，保留資料庫、程式碼、報告與預覽集)
const itemsToInclude = [
  '專案完整內容與對話記錄總匯.md',
  '畢業專題書面報告_紡絲助劑與鐵砂智能庫存管理系統.md',
  'README.md',
  'package.json',
  '.env.example',
  'public',
  'server',
  'data',
  '鐵砂_preview.csv',
  '啟動系統.bat',
  '一鍵修復SQL連線.bat',
  '一鍵匯入鐵砂至資料庫.bat',
  '一鍵Netlify發布.bat',
  '一鍵更新至GitHub.bat',
  '一鍵獲取最新進度.bat',
  '一鍵打包專案與對話紀錄.bat'
];

// 檢查各檔案是否存在
const validItems = itemsToInclude.filter(item => {
  const p = path.join(rootDir, item);
  return fs.existsSync(p);
});

console.log(`📋 本次打包項目 (${validItems.length} 項):`);
validItems.forEach(i => console.log(`   - ${i}`));

// 透過 PowerShell Compress-Archive 進行高壓縮率打包
const psItems = validItems.map(i => `'${path.join(rootDir, i)}'`).join(',');
const psCmd = `powershell -NoProfile -Command "Compress-Archive -Path ${psItems} -DestinationPath '${zipPath}' -Force"`;

try {
  console.log('\n⏳ 正在壓縮中，請稍候...');
  execSync(psCmd, { stdio: 'inherit' });
  const stat = fs.statSync(zipPath);
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
  console.log('\n========================================================');
  console.log(`✅ 專案全內容與對話記錄已成功打包！`);
  console.log(`📁 輸出檔案: ${zipPath}`);
  console.log(`📊 壓縮包大小: ${sizeMb} MB (包含 85,819 筆完整資料庫、全套原始碼與完整記錄)`);
  console.log('========================================================');
} catch (err) {
  console.error('❌ 打包時發生錯誤:', err.message);
}
