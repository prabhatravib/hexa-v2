import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if dist/index.html exists
const indexPath = path.join(__dirname, '..', 'dist', 'index.html');

if (fs.existsSync(indexPath)) {
  console.log('✅ Found dist/index.html - proceeding with asset injection');
  process.exit(0);
} else {
  console.error('❌ dist/index.html not found. Please run vite build first.');
  process.exit(1);
}

