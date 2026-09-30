/**
 * DYARTE OPTIMIZER - Electron Main Process
 * Entry point do aplicativo desktop nativo para Windows.
 */

const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const crypto = require('crypto');
const driverService = require('./driverService.cjs');

const SPKI_HEADER = Buffer.from('302a300506032b6570032100', 'hex');
const SERVER_ED25519_PUB_HEX = '9fc58ae7dd4361cad6a68dabefa3e061fbe684a76c0e91d53ad85a120e2d6666';

/**
 * Requirement 9: Driver / DDU Central Authorization Validator
 * O Electron Main Process deve impedir chamadas arbitrárias de mutação vindas do renderer.
 */
function verifyExecutionTokenForIpc(tokenStr, allowedToolIds) {
  if (!tokenStr || typeof tokenStr !== 'string' || tokenStr.trim().length === 0) {
    return { valid: false, error: 'Token de execução obrigatório ausente. Operação bloqueada pelo Electron.' };
  }

  const dotIdx = tokenStr.indexOf('.');
  if (dotIdx === -1) {
    return { valid: false, error: 'Token de execução com formato inválido.' };
  }

  try {
    const payloadBuf = Buffer.from(tokenStr.substring(0, dotIdx), 'base64url');
    const sigBuf = Buffer.from(tokenStr.substring(dotIdx + 1), 'base64url');

    if (sigBuf.length !== 64 || payloadBuf.length === 0) {
      return { valid: false, error: 'Comprimento ou decodificação da assinatura do token inválida.' };
    }

    const pubKey = crypto.createPublicKey({
      key: Buffer.concat([SPKI_HEADER, Buffer.from(SERVER_ED25519_PUB_HEX, 'hex')]),
      format: 'der',
      type: 'spki',
    });

    const isSigValid = crypto.verify(null, payloadBuf, pubKey, sigBuf);
    if (!isSigValid) {
      return { valid: false, error: 'Assinatura criptográfica do token de execução rejeitada pelo Electron.' };
    }

    const payload = JSON.parse(payloadBuf.toString('utf8'));
    const nowSec = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp <= nowSec) {
      return { valid: false, error: 'Token de autorização expirado no servidor.' };
    }

    if (!payload.request_id || typeof payload.request_id !== 'string') {
      return { valid: false, error: 'Token de execução inválido: request_id obrigatório ausente.' };
    }

    if (!payload.execution_id || typeof payload.execution_id !== 'string') {
      return { valid: false, error: 'Token de execução inválido: execution_id obrigatório ausente.' };
    }

    if (payload.operation !== 'APPLY' && payload.operation !== 'ROLLBACK') {
      return { valid: false, error: 'Token de execução inválido: operation inválida.' };
    }

    if (Array.isArray(allowedToolIds) && !allowedToolIds.includes(payload.tool_id)) {
      return {
        valid: false,
        error: `Ferramenta autorizada no token ('${payload.tool_id}') não corresponde à operação solicitada.`,
      };
    }

    return { valid: true, payload };
  } catch (err) {
    return { valid: false, error: 'Falha na validação criptográfica do token: ' + (err.message || err) };
  }
}

const SERVER_PORT = 3000;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

let mainWindow = null;
let serverProcess = null;
let agentProcess = null;

// User-Agent limpo para evitar bloqueio do Google OAuth (disallowed_useragent)
const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

console.log('[Electron] ========================================');
console.log('[Electron] Iniciando DYARTE OPTIMIZER Desktop v1.0.0');
console.log('[Electron] Plataforma:', process.platform, 'Arquitetura:', process.arch);
console.log('[Electron] Diretório base:', __dirname);
console.log('[Electron] Recursos (process.resourcesPath):', process.resourcesPath || 'N/A');
console.log('[Electron] ========================================');

/**
 * Verifica se a porta do servidor local já está pronta e respondendo
 */
function checkServerReady(port = SERVER_PORT) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => {
      resolve(false);
    });
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Aguarda o servidor estar pronto com retentativas
 */
async function waitForServer(maxAttempts = 30, delayMs = 500) {
  console.log(`[Electron] [Server] Aguardando servidor na porta ${SERVER_PORT}...`);
  for (let i = 1; i <= maxAttempts; i++) {
    const isReady = await checkServerReady();
    if (isReady) {
      console.log(`[Electron] [Server] Servidor online e respondendo na porta ${SERVER_PORT} (tentativa ${i}).`);
      return true;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/**
 * Inicia o backend de produção (dist/server.cjs)
 */
function startProductionServer() {
  const isPackaged = app.isPackaged;
  console.log(`[Electron] [Server] Modo de execução: ${isPackaged ? 'PRODUÇÃO / EMPACOTADO' : 'DESENVOLVIMENTO'}`);

  const fs = require('fs');

  // Determina caminhos robustos para server.cjs e pasta dist
  let serverScriptPath = path.join(__dirname, 'dist', 'server.cjs');
  let staticDistPath = path.join(__dirname, 'dist');
  let appBasePath = __dirname;

  if (isPackaged) {
    appBasePath = process.resourcesPath ? process.resourcesPath : __dirname;
    const asarServer = path.join(process.resourcesPath, 'app.asar', 'dist', 'server.cjs');
    const asarDist = path.join(process.resourcesPath, 'app.asar', 'dist');

    if (fs.existsSync(asarServer)) {
      serverScriptPath = asarServer;
      staticDistPath = asarDist;
    } else {
      serverScriptPath = path.join(__dirname, 'dist', 'server.cjs');
      staticDistPath = path.join(__dirname, 'dist');
    }
  }

  console.log('[Electron] [Server] Base path:', appBasePath);
  console.log('[Electron] [Server] Caminho do executável do servidor:', serverScriptPath);
  console.log('[Electron] [Server] Caminho estático dist:', staticDistPath);

  try {
    // Executa usando o runtime do Node embutido no Electron (ELECTRON_RUN_AS_NODE: 1)
    // Isso garante funcionamento 100% autônomo no Windows sem exigir Node.js pré-instalado!
    const env = {
      ...process.env,
      PORT: String(SERVER_PORT),
      NODE_ENV: 'production',
      ELECTRON_RUN_AS_NODE: '1',
      STATIC_DIST_PATH: staticDistPath,
    };

    serverProcess = spawn(process.execPath, [serverScriptPath], {
      cwd: appBasePath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    serverProcess.stdout?.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[Server] ${msg}`);
    });

    serverProcess.stderr?.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.error(`[Server Error] ${msg}`);
    });

    serverProcess.on('exit', (code, signal) => {
      console.log(`[Electron] [Server] Processo do servidor encerrado (código: ${code}, sinal: ${signal})`);
    });

    serverProcess.on('error', (err) => {
      console.error('[Electron] [Server] Falha ao iniciar processo do servidor:', err.message);
    });
  } catch (err) {
    console.error('[Electron] [Server] Erro ao disparar servidor de produção:', err);
  }
}

/**
 * Inicia o Agente nativo do Windows (dyarte-agent.exe)
 * Escuta exclusivamente em 127.0.0.1:49152
 */
function startNativeAgent() {
  const fs = require('fs');
  const isPackaged = app.isPackaged;

  // Localização do executável do Agent
  // Em produção/instalador: resources/agent/dyarte-agent.exe
  // Em desenvolvimento: agent/build/Release/dyarte-agent.exe
  const possiblePaths = [
    path.join(process.resourcesPath || '', 'agent', 'dyarte-agent.exe'),
    path.join(__dirname, 'agent', 'build', 'Release', 'dyarte-agent.exe'),
    path.join(__dirname, 'agent', 'dyarte-agent.exe'),
  ];

  let agentExePath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      agentExePath = p;
      break;
    }
  }

  if (!agentExePath) {
    console.log('[Electron] [Agent] Binário dyarte-agent.exe não encontrado nos caminhos padrões. Inicialização automática suspensa.');
    return;
  }

  console.log('[Electron] [Agent] Localizado binário do Agent:', agentExePath);

  try {
    const workingDir = path.dirname(agentExePath);
    agentProcess = spawn(agentExePath, [], {
      cwd: workingDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    agentProcess.stdout?.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[Native Agent] ${msg}`);
    });

    agentProcess.stderr?.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.error(`[Native Agent Error] ${msg}`);
    });

    agentProcess.on('exit', (code, signal) => {
      console.log(`[Electron] [Agent] Processo do Agent encerrado (código: ${code}, sinal: ${signal})`);
      agentProcess = null;
    });

    agentProcess.on('error', (err) => {
      console.error('[Electron] [Agent] Falha ao disparar dyarte-agent.exe:', err.message);
      agentProcess = null;
    });

    console.log(`[Electron] [Agent] dyarte-agent.exe disparado com sucesso (PID: ${agentProcess.pid || 'ativo'}).`);
  } catch (err) {
    console.error('[Electron] [Agent] Erro ao iniciar dyarte-agent.exe:', err);
  }
}

/**
 * Encerra o processo do Native Agent com segurança
 */
function killAgentProcess() {
  if (agentProcess) {
    console.log('[Electron] [Agent] Encerrando processo do Native Agent (PID:', agentProcess.pid, ')...');
    try {
      if (process.platform === 'win32' && agentProcess.pid) {
        spawn('taskkill', ['/pid', String(agentProcess.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      } else {
        agentProcess.kill('SIGTERM');
      }
    } catch (e) {
      // ignore
    }
    agentProcess = null;
  }
}

/**
 * Cria a janela principal do Electron
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    frame: false, // Remove a barra nativa do Windows para usar a barra profissional unificada
    backgroundColor: '#08080a',
    title: 'DYARTE OPTIMIZER',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false, // OBRIGATÓRIO POR SEGURANÇA
      contextIsolation: true, // OBRIGATÓRIO POR SEGURANÇA
      sandbox: false,
      devTools: !app.isPackaged,
    },
  });

  // Configura User-Agent limpo para garantir compatibilidade com Google OAuth e Firebase Auth
  mainWindow.webContents.setUserAgent(CHROME_USER_AGENT);

  // Garante que qualquer janela filha/popup criada receba o User-Agent do Chrome legítimo
  mainWindow.webContents.on('did-create-window', (childWindow) => {
    console.log('[Electron] [OAuth] Janela filha/popup criada. Aplicando User-Agent do Chrome limpo.');
    childWindow.webContents.setUserAgent(CHROME_USER_AGENT);
  });

  // Gerenciamento de janelas filhas e popups (Google Login & Links Externos)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log('[Electron] Solicitação de abertura de URL:', url);

    // Permite popups de autenticação do Google e Firebase Auth
    if (
      url.includes('accounts.google.com') ||
      url.includes('firebaseapp.com') ||
      url.includes('/__/auth/handler') ||
      url.includes('google.com/o/oauth2') ||
      url.includes('googleapis.com')
    ) {
      console.log('[Electron] [Auth] Permitindo popup de autenticação Google / Firebase Auth.');
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 650,
          frame: true, // Popup do Google tem moldura nativa para clareza
          autoHideMenuBar: true,
          center: true,
          title: 'Google Login - DYARTE OPTIMIZER',
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: false, // Necessário para comunicação via postMessage/window.opener com o Firebase Auth
            sandbox: false,
          },
        },
      };
    }

    // Links externos abrem no navegador padrão do Windows (sem sair do app)
    console.log('[Electron] Redirecionando link externo para o navegador padrão do Windows:', url);
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    console.log('[Electron] Janela principal exibida com sucesso.');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Carrega a aplicação a partir do servidor local
  mainWindow.loadURL(SERVER_URL).catch((err) => {
    console.error('[Electron] Falha ao carregar URL do servidor local:', err.message);
  });
}

/**
 * Configuração dos Handlers IPC Seguros
 */
function setupIpcHandlers() {
  // Controles da Janela Customizada
  ipcMain.handle('window:minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.handle('window:close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });

  ipcMain.handle('window:is-maximized', () => {
    return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false;
  });

  // Camada de Drivers
  ipcMain.handle('drivers:get-path', () => {
    return driverService.getDriversPath();
  });

  ipcMain.handle('drivers:detect-gpu', () => {
    return driverService.detectGpuVendor();
  });

  ipcMain.handle('drivers:find-installer', (_event, vendor) => {
    return driverService.findDriverInstaller(vendor);
  });

  ipcMain.handle('drivers:execute', async (_event, vendor, executionToken) => {
    // Requirement 9: Never allow React -> Electron -> Execute without Backend Authorization Token
    const authCheck = verifyExecutionTokenForIpc(executionToken, [
      'tool_gpu_amd_driver',
      'tool_gpu_nvidia_driver',
      'tool_gpu_amd_opt',
      'tool_gpu_nvidia_opt',
      'tool_driver_installer',
    ]);

    if (!authCheck.valid) {
      console.error('[Electron] [Security] drivers:execute BLOQUEADO:', authCheck.error);
      return {
        success: false,
        phase: 'failed',
        error_code: 'UNAUTHORIZED_MUTATION',
        error: `OPERAÇÃO DE DRIVER BLOQUEADA: ${authCheck.error}`,
      };
    }

    return await driverService.executeDriverInstaller(vendor);
  });

  ipcMain.handle('drivers:get-status', () => {
    return driverService.getDriverStatus();
  });

  // Ferramenta DDU (Display Driver Uninstaller) - Isolada e Segura
  ipcMain.handle('ddu:get-path', () => {
    return driverService.getDduPath();
  });

  ipcMain.handle('ddu:execute', async (_event, executionToken) => {
    // Requirement 9: Never allow DDU execution without Backend Authorization Token
    const authCheck = verifyExecutionTokenForIpc(executionToken, [
      'tool_gpu_clean_drivers',
      'tool_clean_ddu',
    ]);

    if (!authCheck.valid) {
      console.error('[Electron] [Security] ddu:execute BLOQUEADO:', authCheck.error);
      return {
        status: 'DDU_FAILED',
        success: false,
        error_code: 'UNAUTHORIZED_MUTATION',
        error: `OPERAÇÃO DDU BLOQUEADA: ${authCheck.error}`,
        message: `OPERAÇÃO DDU BLOQUEADA: ${authCheck.error}`,
      };
    }

    return await driverService.executeDdu();
  });

  // Aliases compatíveis para DDU
  ipcMain.handle('driver:get-ddu-path', () => {
    return driverService.getDduPath();
  });

  ipcMain.handle('driver:execute-ddu', async (_event, executionToken) => {
    const authCheck = verifyExecutionTokenForIpc(executionToken, [
      'tool_gpu_clean_drivers',
      'tool_clean_ddu',
    ]);

    if (!authCheck.valid) {
      console.error('[Electron] [Security] driver:execute-ddu BLOQUEADO:', authCheck.error);
      return {
        status: 'DDU_FAILED',
        success: false,
        error_code: 'UNAUTHORIZED_MUTATION',
        error: `OPERAÇÃO DDU BLOQUEADA: ${authCheck.error}`,
        message: `OPERAÇÃO DDU BLOQUEADA: ${authCheck.error}`,
      };
    }

    return await driverService.executeDdu();
  });

  // Aplicação geral
  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:open-external', (_event, url) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      shell.openExternal(url);
    }
  });
}

/**
 * Encerra o processo do servidor com segurança
 */
function killServerProcess() {
  if (serverProcess) {
    console.log('[Electron] [Server] Encerrando servidor de produção local...');
    try {
      if (process.platform === 'win32' && serverProcess.pid) {
        // Encerramento forçado de árvore no Windows
        spawn('taskkill', ['/pid', String(serverProcess.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      } else {
        serverProcess.kill('SIGTERM');
      }
    } catch (e) {
      // ignore
    }
    serverProcess = null;
  }
}

// -------------------------------------------------------------
// CICLO DE VIDA DO APLICATIVO ELECTRON
// -------------------------------------------------------------

app.whenReady().then(async () => {
  // Registra User-Agent global para sessões (elimina o disallowed_useragent do Google Login)
  session.defaultSession.setUserAgent(CHROME_USER_AGENT);

  // Intercepta cabeçalhos HTTP para garantir User-Agent limpo do Chrome e remover assinaturas de webview
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = CHROME_USER_AGENT;
    if (details.requestHeaders['X-Requested-With']) {
      delete details.requestHeaders['X-Requested-With'];
    }
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  setupIpcHandlers();

  // Verifica se o servidor já está ativo (ex: dev server na porta 3000)
  const isAlreadyRunning = await checkServerReady();
  if (!isAlreadyRunning) {
    console.log('[Electron] Servidor local não detectado na porta 3000. Inicializando backend de produção...');
    startProductionServer();
    const ready = await waitForServer(30, 400);
    if (!ready) {
      console.error('[Electron] Tempo limite esgotado para o servidor local.');
    }
  } else {
    console.log('[Electron] Servidor local já está ativo na porta 3000. Reutilizando instância.');
  }

  // Inicializa o Native Agent do Windows (se o executável dyarte-agent.exe estiver presente)
  startNativeAgent();

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  killAgentProcess();
  killServerProcess();
});

app.on('window-all-closed', () => {
  killAgentProcess();
  killServerProcess();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
