// 一次性脚本：将 icon.svg 转换为 icon.png (1024x1024)
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, 'icons', 'icon.svg');
const pngPath = path.join(__dirname, 'icons', 'icon.png');

const svgBuffer = fs.readFileSync(svgPath);

sharp(svgBuffer)
    .resize(1024, 1024)
    .png()
    .toFile(pngPath)
    .then(() => console.log('图标生成成功:', pngPath))
    .catch(err => console.error('生成失败:', err));
