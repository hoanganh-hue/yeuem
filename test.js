const fs = require('fs');
const path = require('path');

// Test file access
const testFile = path.join(__dirname, 'test.txt');
fs.writeFileSync(testFile, 'Test content');
console.log('Can write file:', fs.existsSync(testFile));

// Test directory access
['uploads', 'logs', 'temp', 'data'].forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  console.log(`Directory ${dir} exists:`, fs.existsSync(dirPath));
}); 