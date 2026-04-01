const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const imagesDir = path.join(__dirname, '../public/images/products');

console.log('📸 Backing up product images to Git...\n');

if (!fs.existsSync(imagesDir)) {
  console.log('❌ Images directory not found');
  process.exit(1);
}

const images = fs.readdirSync(imagesDir).filter(f => 
  f !== '.gitkeep' && /\.(jpg|jpeg|png|gif|webp)$/i.test(f)
);

console.log(`Found ${images.length} images:\n`);
images.forEach(img => {
  console.log(`  - ${img}`);
});

console.log('\n📤 Adding images to Git...');

try {
  execSync('git add public/images/products/*.jpg', { stdio: 'inherit' });
  execSync('git add public/images/products/*.png', { stdio: 'inherit' });
  execSync('git add public/images/products/*.jpeg', { stdio: 'inherit' });
  execSync('git add public/images/products/*.gif', { stdio: 'inherit' });
  execSync('git add public/images/products/*.webp', { stdio: 'inherit' });
  
  console.log('\n✅ Images added to Git');
  console.log('\n📝 Run these commands to complete backup:');
  console.log('  git commit -m "Backup product images"');
  console.log('  git push');
  
} catch (error) {
  console.error('❌ Error adding images:', error.message);
}
