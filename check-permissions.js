const fs = require('fs-extra');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function checkAndSetPermissions() {
    console.log('Kiểm tra và thiết lập quyền cao nhất cho hệ thống...');

    // Thiết lập umask để tạo file với quyền cao nhất
    process.umask(0);

    // Thiết lập biến môi trường
    process.env.ALLOW_SYSTEM_ACCESS = 'true';
    process.env.SUDO_ALLOWED = 'true';
    process.env.ENABLE_ROOT_ACCESS = 'true';
    process.env.ENABLE_FULL_ACCESS = 'true';
    process.env.BYPASS_SECURITY = 'true';
    process.env.NO_RESTRICTIONS = 'true';

    // Kiểm tra và tạo các thư mục cần thiết
    const dirs = ['logs', 'uploads', 'backups', 'temp', 'data', 'ssl'];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
        }
        await execAsync(`chmod -R 777 ${dir}`);
    }

    // Kiểm tra quyền thực thi
    try {
        await execAsync('sudo -n true');
        console.log('✅ Có quyền sudo');
    } catch {
        console.log('❌ Không có quyền sudo');
    }

    // Kiểm tra quyền file system
    const testFile = 'test-permissions.txt';
    try {
        fs.writeFileSync(testFile, 'test', { mode: 0o777 });
        fs.unlinkSync(testFile);
        console.log('✅ Có quyền đầy đủ trên file system');
    } catch {
        console.log('❌ Không có quyền đầy đủ trên file system');
    }

    // Kiểm tra quyền network
    try {
        await execAsync('netstat -tulpn');
        console.log('✅ Có quyền xem network connections');
    } catch {
        console.log('❌ Không có quyền xem network connections');
    }

    // Kiểm tra quyền process
    try {
        await execAsync('ps aux');
        console.log('✅ Có quyền xem processes');
    } catch {
        console.log('❌ Không có quyền xem processes');
    }

    console.log('\nThông tin hệ thống:');
    console.log('- OS:', os.platform(), os.release());
    console.log('- CPU:', os.cpus()[0].model);
    console.log('- Memory:', Math.round(os.totalmem() / 1024 / 1024 / 1024), 'GB');
    console.log('- User:', os.userInfo().username);
    console.log('- Hostname:', os.hostname());

    console.log('\nKiểm tra hoàn tất!');
}

checkAndSetPermissions().catch(console.error); 