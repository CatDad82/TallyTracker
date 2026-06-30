/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Secure Preload Electron IPC tunnel (CommonJS).
 * Exposes safe active process tracking hooks to the client-side React UI layer.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getActiveWindowProcess: () => ipcRenderer.invoke('get-active-window-process'),
  onTrayNotification: (callback) => ipcRenderer.on('tray-event', callback)
});
