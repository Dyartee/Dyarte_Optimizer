/**
 * DYARTE OPTIMIZER - Preload Script
 * Ponte de comunicação IPC segura entre o Electron Main Process e o React Renderer.
 * 
 * Regras de Segurança:
 * - contextIsolation: true
 * - nodeIntegration: false
 * - Sem APIs diretas de child_process, fs ou shell no renderer.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dyarte', {
  isElectron: true,
  platform: process.platform,

  // Controles da Janela Desktop (Minimizar, Maximizar/Restaurar, Fechar)
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  },

  // Camada de Drivers do Sistema (Detecção de GPU, Localização e Execução)
  drivers: {
    getDriversPath: () => ipcRenderer.invoke('drivers:get-path'),
    detectGpuVendor: () => ipcRenderer.invoke('drivers:detect-gpu'),
    findDriverInstaller: (vendor) => ipcRenderer.invoke('drivers:find-installer', vendor),
    executeDriverInstaller: (vendor, executionToken) => ipcRenderer.invoke('drivers:execute', vendor, executionToken),
    getDriverStatus: () => ipcRenderer.invoke('drivers:get-status'),
  },

  // Ferramenta DDU (Display Driver Uninstaller) - Execução isolada e segura
  ddu: {
    getDduPath: () => ipcRenderer.invoke('ddu:get-path'),
    executeDdu: (executionToken) => ipcRenderer.invoke('ddu:execute', executionToken),
  },

  // Informações da aplicação
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  },

  // Agente Nativo Windows (dyarte-agent.exe)
  agent: {
    getStatus: () => ipcRenderer.invoke('agent:get-status'),
    restart: () => ipcRenderer.invoke('agent:restart'),
    onStatusChange: (callback) => {
      const sub = (_event, data) => callback(data);
      ipcRenderer.on('agent:status-changed', sub);
      return () => ipcRenderer.removeListener('agent:status-changed', sub);
    },
  },

  // Privilégios de Administrador do Windows
  admin: {
    isAdmin: () => ipcRenderer.invoke('admin:is-admin'),
    requestElevation: () => ipcRenderer.invoke('admin:request-elevation'),
  },
});
