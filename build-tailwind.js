const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Output paths
const rawCssPath = path.join(__dirname, 'tailwind.raw.css');
const finalHtmlPath = path.join(__dirname, 'Tailwind.html');

console.log('Building Tailwind CSS...');

try {
  // Run the Tailwind CLI. Adjust the path if you need minification (--minify)
  execSync('npx @tailwindcss/cli -i ./input.css -o ./tailwind.raw.css --minify', { stdio: 'inherit' });
  
  // Read the generated CSS
  const cssContent = fs.readFileSync(rawCssPath, 'utf8');
  
  // Wrap it in a <style> tag
  const htmlContent = `<style>\n/* Generated Tailwind CSS */\n${cssContent}\n</style>`;
  
  // Save as Tailwind.html
  fs.writeFileSync(finalHtmlPath, htmlContent, 'utf8');
  
  // Clean up the raw css file
  fs.unlinkSync(rawCssPath);
  
  console.log('Successfully created Tailwind.html');
} catch (error) {
  console.error('Failed to build Tailwind CSS:', error);
  process.exit(1);
}
