const { execSync } = require('child_process');

const ports = process.argv.slice(2).map((value) => Number(value)).filter(Boolean);

if (!ports.length) process.exit(0);

const platform = process.platform;

const getPidsForPort = (port) => {
  try {
    if (platform === 'win32') {
      const output = execSync(`netstat -ano -p tcp | findstr :${port}`, {
        stdio: ['ignore', 'pipe', 'ignore'],
      }).toString();

      return Array.from(
        new Set(
          output
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .filter((line) => line.includes('LISTENING'))
            .map((line) => line.split(/\s+/).pop())
            .filter(Boolean)
        )
      );
    }

    const output = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();

    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    return [];
  }
};

const killPid = (pid) => {
  try {
    if (platform === 'win32') {
      execSync(`taskkill /PID ${pid} /F`, {
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      return true;
    }

    process.kill(Number(pid), 'SIGKILL');
    return true;
  } catch (error) {
    return false;
  }
};

ports.forEach((port) => {
  const pids = getPidsForPort(port);

  if (!pids.length) return;

  pids.forEach((pid) => {
    const killed = killPid(pid);
    if (killed) {
      console.log(`[free-ports] cleared port ${port} by stopping PID ${pid}`);
    }
  });
});
