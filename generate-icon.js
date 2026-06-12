// 一次性脚本：生成Android各尺寸图标
const sharp = require('sharp');
const path = require('path');

const src = path.join(__dirname, 'icons', 'icon.png');
const resDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');

const sizes = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192
};

async function generate() {
    for (const [dir, size] of Object.entries(sizes)) {
        const outDir = path.join(resDir, dir);
        for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
            await sharp(src)
                .resize(size, size)
                .png()
                .toFile(path.join(outDir, name));
            console.log(`${dir}/${name} (${size}x${size})`);
        }
    }
    console.log('Android图标全部生成完成！');
}

generate().catch(err => console.error('生成失败:', err));
